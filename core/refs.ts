import type { DependencyJson } from "@deno/graph/types";
import { toUrl } from "@molt/lib/path";
import { createGraphLocally } from "./graph.ts";
import { readImportMapJson } from "./import_map.ts";

/** Type of the source of the dependency. */
export type SourceType = "esm" | "import_map";

/** Span of the dependency in the source code. */
export type RangeJson = NonNullable<DependencyJson["code"]>["span"];

/** Information about the source of the dependency. */
export type DependencySource<T extends SourceType> = {
  /** The type of the source of the dependency. */
  type: T;
  /** The full path to the module that imports the dependency.
   * @example "file:///path/to/mod.ts" */
  url: string;
} & DependencySourceLocator<T>;

/** Locator of the source of the dependency. */
export type DependencySourceLocator<
  T extends SourceType,
> = T extends "esm" ? { span: RangeJson }
  : T extends "import_map" ? { key: string }
  : never;

/** Representation of a reference to a dependency. */
export interface DependencyRef<
  T extends SourceType = SourceType,
> {
  /** The original specifier of the dependency appeared in the code. */
  specifier: string;
  /** Information about the source of the dependency. */
  source: DependencySource<T>;
}

export interface CollectFromModuleOptions {
  /** Whether to resolve local imports and find dependencies recursively.
   * @default true */
  recursive?: boolean;
}

const compare = (a: DependencyRef, b: DependencyRef) =>
  a.specifier.localeCompare(b.specifier);

/**
 * Collect dependencies from the given ES module(s), sorted by name.
 * @param paths The path to the ES module(s) to collect dependencies from.
 * @param options The options to customize the collection process.
 */
export async function collectFromEsModules(
  paths: string | URL | (string | URL)[],
  options: CollectFromModuleOptions = {},
): Promise<DependencyRef<"esm">[]> {
  const urls = [paths].flat().map(toUrl);
  const graph = await createGraphLocally(urls, options);

  const deps: DependencyRef<"esm">[] = [];
  graph.modules.forEach((mod) =>
    mod.dependencies?.forEach((json) => {
      const dep = fromDependencyJson(json, mod.specifier);
      if (dep) deps.push(dep);
    })
  );
  return deps.sort(compare);
}

function fromDependencyJson(
  json: DependencyJson,
  referrer: string,
): DependencyRef<"esm"> | undefined {
  const specifier = json.specifier;
  const url = json.code?.specifier ?? json.type?.specifier;
  const { span } = json.code ?? json.type ?? {};
  if (url && span) {
    return {
      specifier,
      source: { type: "esm", url: referrer, span },
    };
  }
}

/** Collect dependencies from the given import map file, or a Deno configuration
 * file, sorted lexically by name. */
export async function collectFromImportMap(
  path: string | URL,
): Promise<DependencyRef<"import_map">[]> {
  const url = toUrl(path);
  const json = await readImportMapJson(path);
  return Object.entries(json.imports).map((
    [key, specifier],
  ): DependencyRef<"import_map"> => ({
    specifier,
    source: { type: "import_map", url, key },
  })).sort(compare);
}
