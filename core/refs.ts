import type { DependencyJson } from "@deno/graph/types";
import { toUrl } from "@molt/lib/path";
import { type Dependency, parse } from "./deps.ts";
import { createGraphLocally } from "./graph.ts";
import { readImportMapJson } from "./import_map.ts";

/** Type of the source of the dependency. */
export type SourceKind = "esm" | "import_map";

/** Span of the dependency in the source code. */
export type RangeJson = NonNullable<DependencyJson["code"]>["span"];

/** Information about the source of the dependency. */
export type DependencySource<K extends SourceKind> = {
  /** The full path to the module that imports the dependency.
   * @example "file:///path/to/mod.ts" */
  specifier: string;
  /** The type of the source of the dependency. */
  kind: K;
} & DependencySourceLocator<K>;

/** Locator of the source of the dependency. */
export type DependencySourceLocator<
  K extends SourceKind,
> = K extends "esm" ? { span: RangeJson }
  : K extends "import_map" ? { key: string }
  : never;

/** Representation of a reference to a dependency. */
export interface DependencyRef<
  K extends SourceKind = SourceKind,
> {
  /** The parsed components of the dependency specifier. */
  dependency: Dependency;
  /** Information about the source of the dependency. */
  source: DependencySource<K>;
}

export interface FromEsModulesOptions {
  /** Whether to resolve local imports and find dependencies recursively.
   * @default true */
  recursive?: boolean;
}

const compare = (a: DependencyRef, b: DependencyRef) =>
  a.dependency.name.localeCompare(b.dependency.name);

/**
 * Collect dependencies from the given ES module(s), sorted by name.
 * @param paths The path to the ES module(s) to collect dependencies from.
 * @param options The options to customize the collection process.
 */
export async function collectFromEsModules(
  paths: string | URL | (string | URL)[],
  options: FromEsModulesOptions = {},
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
      dependency: parse(specifier),
      source: { specifier: referrer, kind: "esm", span },
    };
  }
}

/** Collect dependencies from the given import map file, or a Deno configuration
 * file, sorted lexically by name. */
export async function collectFromImportMap(
  path: string | URL,
): Promise<DependencyRef<"import_map">[]> {
  const specifier = toUrl(path);
  const json = await readImportMapJson(path);
  return Object.entries(json.imports).map((
    [key, value],
  ): DependencyRef<"import_map"> => ({
    dependency: parse(value),
    source: { specifier, kind: "import_map", key },
  })).sort(compare);
}
