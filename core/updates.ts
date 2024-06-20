import type { DependencyJson } from "@deno/graph/types";
import { findFileUp, toPath, toUrl } from "@molt/lib/path";
import { assertExists } from "@std/assert";
import { partition } from "@std/collections";
import {
  type Dependency,
  hasVersionRange,
  parse,
  resolveLatestVersion,
  stringify,
  type UpdatedDependency,
} from "./dependency.ts";
import { createGraphLocally } from "./graph.ts";
import {
  type ImportMap,
  type ImportMapResolveResult,
  readImportMapJson,
  tryReadFromJson,
} from "./import_map.ts";

export type SourceType = "import_map" | "module" | "lockfile";

/**
 * Representation of an update to a dependency.
 */
export interface DependencyUpdate<
  T extends SourceType = SourceType,
> {
  /**
   * Properties of the dependency being updated.
   * Undefined if the dependency is added.
   */
  from: T extends "lockfile" ? Dependency | undefined : Dependency;
  /*
   * Properties of the updated dependency.
   */
  to: UpdatedDependency;
  /**
   * The code of the dependency. Note that `type` in the DependencyJSON
   * is merged into `code` here for convenience.
   */
  code: {
    /** The original specifier of the dependency appeared in the code. */
    specifier: string;
    span: T extends "module" ? NonNullable<DependencyJson["code"]>["span"]
      : undefined;
  };
  /**
   * Information about the import map used to resolve the dependency.
   */
  map: T extends "import_map" ? {
      /** The full path to the import map used to resolve the dependency.
       * @example "/path/to/import_map.json" */
      source: string;
    } & ImportMapResolveResult<true>
    : undefined;
  /**
   * The full path to the module that imports the dependency.
   * @example "/path/to/mod.ts"
   */
  referrer: string;
}

export function sourceTypeOf(update: DependencyUpdate): SourceType {
  if (update.map) {
    return "import_map";
  } else if (update.code.span) {
    return "module";
  } else {
    return "lockfile";
  }
}

export interface CollectOptions {
  /**
   * Whether to use the cache to resolve dependencies.
   * @default true
   */
  cache?: boolean;
  /**
   * The working directory to resolve relative paths.
   * If not specified, the current working directory is used.
   * @example "/path/to/project"
   */
  cwd?: string | URL;
  /**
   * The path to the import map used to resolve dependencies.
   * If not specified, molt will automatically find deno.json or deno.jsonc
   * in the current working directory or parent directories.
   * @example
   * ```ts
   * const updates = await DependencyUpdate.collect("mod.ts", {
   *   importMap: "import_map.json"
   *   // -> Use import_map.json in the current directory
   * });
   * ```
   */
  importMap?: string | URL;
  /**
   * A function to filter out dependencies.
   * @example
   * ```ts
   * const updates = await DependencyUpdate.collect("mod.ts", {
   *   ignore: (dep) => dep.name === "deno.land/std"
   *   // -> Ignore all dependencies from deno.land/std
   * });
   * ```
   */
  ignore?: (dependency: Dependency) => boolean;
  /**
   * A function to pick dependencies.
   * @example
   * ```ts
   * const updates = await DependencyUpdate.collect("mod.ts", {
   *   only: (dep) => dep.name === "deno.land/std"
   *   // -> Only pick dependencies from deno.land/std
   * });
   * ```
   */
  only?: (dependency: Dependency) => boolean;
  /**
   * Whether to resolve local submodules.
   * @default true
   */
  resolveLocal?: boolean;
}

/**
 * Collect dependencies from the given module(s) or Deno configuration file(s).
 * Local submodules are also checked recursively.

 * @param from - The path(s) to the file(s) to collect dependencies from.
 * @param options - Options to customize the behavior.
 * @returns The list of dependencies.
 *
 * @example
 * ```typescript
 * collect("mod.ts")
 * // -> Collect updates to the dependencies from mod.ts and its local submodules.
 * ```
 * @example
 * ```typescript
 * collect("deno.json")
 * // -> Collect updates to the dependencies from the import map specified in deno.json
 * ```
 */
export async function collect(
  from: string | URL | (string | URL)[],
  options: CollectOptions = {},
): Promise<DependencyUpdate[]> {
  const cwd = options.cwd ?? Deno.cwd();

  const importMapPath = options.importMap ??
    await findFileUp(cwd, "deno.json", "deno.jsonc");
  const importMap = importMapPath
    ? await tryReadFromJson(toUrl(importMapPath))
    : undefined;

  const urls = [from].flat().map((path) => toUrl(path));
  const [jsons, esms] = partition(urls, isJsonPath);

  const graph = await createGraphLocally(esms, {
    resolve: importMap?.resolveInner,
    recursive: options.resolveLocal ??= true,
  });

  const _options: CheckOptions = { cache: true, ...options, importMap };

  const updates: DependencyUpdate[] = [];
  for (const mod of graph.modules) {
    for (const dep of mod.dependencies ?? []) {
      const update = await checkDependency(dep, mod.specifier, _options);
      if (update) updates.push(update);
    }
  }
  for (const url of jsons) {
    (await collectFromImportMap(url, _options)).forEach((u) => updates.push(u));
  }
  return updates.sort((a, b) => a.referrer.localeCompare(b.referrer));
}

//----------------------------------
//
// Inner functions and types
//
//----------------------------------

interface CheckOptions extends Omit<CollectOptions, "importMap" | "lockFile"> {
  importMap?: ImportMap;
}

async function checkDependency(
  dependencyJson: DependencyJson,
  referrer: string,
  options: CheckOptions,
) {
  const resolved = dependencyJson.code?.specifier ??
    dependencyJson.type?.specifier;
  if (!resolved) {
    throw new Error(
      `Could not resolve the dependency: ${dependencyJson.specifier}`,
      { cause: dependencyJson },
    );
  }
  if (resolved.startsWith("file:")) {
    return;
  }

  const mapped = options.importMap?.resolve(
    dependencyJson.specifier,
    referrer,
  ) as ImportMapResolveResult<true> | undefined;

  const dependency = parse(new URL(mapped?.value ?? resolved));

  if (options.ignore?.(dependency) || options.only?.(dependency) === false) {
    return;
  }
  if (hasVersionRange(dependency)) {
    return;
  }

  const latest = await resolveLatestVersion(dependency, {
    cache: options.cache,
  });
  if (!latest || latest.version === dependency.version) {
    return;
  }

  const span = dependencyJson.code?.span ?? dependencyJson.type?.span;
  assertExists(span);

  return {
    from: normalizeWithUpdated(dependency, latest),
    to: latest,
    code: {
      // We prefer to put the original specifier here.
      specifier: dependencyJson.specifier,
      span,
    },
    map: mapped ? { source: options.importMap!.path, ...mapped } : undefined,
    lock: undefined,
    referrer: toPath(referrer),
  };
}

async function collectFromImportMap(
  path: string,
  options: CheckOptions,
): Promise<DependencyUpdate[]> {
  const json = await readImportMapJson(new URL(path));
  const updates: DependencyUpdate[] = [];
  for (const entry of Object.entries(json.imports)) {
    const update = await checkImportMapEntry(path, entry, options);
    if (update) updates.push(update);
  }
  return updates;
}

async function checkImportMapEntry(
  path: string,
  entry: [string, string],
  options: CheckOptions,
): Promise<DependencyUpdate | undefined> {
  const [mapFrom, mapTo] = entry;
  if (!URL.canParse(mapTo)) { // map to a local file
    return;
  }
  const dependency = parse(new URL(mapTo));
  if (options.ignore?.(dependency) || options.only?.(dependency) === false) {
    return;
  }
  if (hasVersionRange(dependency)) {
    return;
  }
  const latest = await resolveLatestVersion(dependency, {
    cache: options.cache,
  });
  if (!latest || latest.version === dependency.version) {
    return;
  }
  return {
    from: normalizeWithUpdated(dependency, latest),
    to: latest,
    code: {
      specifier: mapTo,
      span: undefined,
    },
    map: {
      source: toPath(path),
      resolved: mapTo,
      key: mapFrom,
      value: stringify(latest),
    },
    referrer: toPath(path),
  };
}

//----------------------------------
//
// Utility functions
//
//----------------------------------

function isJsonPath(path: string) {
  return path.endsWith(".json") || path.endsWith(".jsonc");
}

function normalizeWithUpdated(
  dependency: Dependency,
  updated: UpdatedDependency,
): Dependency {
  if (dependency.version) {
    return dependency;
  }
  return {
    ...updated,
    version: undefined,
  };
}
