import type { DependencyJson } from "@deno/graph/types";
import { toUrl } from "@molt/lib/path";
import { assertExists } from "@std/assert";
import * as SemVer from "@std/semver";
import { createGraphLocally } from "./graph.ts";
import { readImportMapJson } from "./import_map.ts";

type DependencyProtocolName = "jsr" | "npm" | "http" | "https";
export type DependencyProtocol = `${DependencyProtocolName}:`;

const isDependencyProtocol = (
  protocol: string,
): protocol is DependencyProtocol =>
  ["jsr:", "npm:", "http:", "https:"].includes(protocol);

/** Parsed components of a dependency specifier. */
export interface Dependency<
  P extends DependencyProtocolName = DependencyProtocolName,
> {
  /** The URL protocol of the dependency specifier.
   * @example "jsr:", "npm:", "https:" */
  protocol: `${P}:`;
  /** The name of the dependency, or a string between the protocol and version.
   * @example "deno.land/std" */
  name: string;
  /** The version string of the dependency.
   * @example "0.205.0" */
  version: SemVer.SemVer;
  /** The subpath of the dependency.
   * @example "/fs/mod.ts", "/bdd", "" */
  entrypoint: string;
}

/**
 * Parse components of the dependency from the given URL.
 * @example
 * const { name, version, path } = Dependency.parse(
 *   new URL("https://deno.land/std@0.200.0/fs/mod.ts")
 * );
 * // -> { protocol: "https:", name: "deno.land/std", version: "0.200.0", path: "/fs/mod.ts" }
 */
export function parse(url: string | URL): Dependency {
  url = new URL(url);
  const protocol = url.protocol;
  if (!isDependencyProtocol(protocol)) {
    throw new Error(`Invalid protocol: ${protocol}`);
  }
  const body = url.hostname + url.pathname;
  // Try to find a path segment like "<name>@<version>/"
  const matched = body.match(
    /^(?<name>.+)@(?<version>[^/]+)(?<entrypoint>\/.*)?$/,
  );
  if (!matched) {
    throw new Error(`Unsupported format of dependency specifier: ${url}`);
  }
  assertExists(matched.groups);
  const { name, entrypoint, version } = matched.groups;
  return {
    protocol,
    // jsr specifier may have a leading slash. e.g. jsr:/@std/testing^0.222.0/bdd
    name: name.startsWith("/") ? name.slice(1) : name,
    version: SemVer.parse(version),
    entrypoint: entrypoint ?? "",
  };
}

/** Try parsing the given URL as a dependency specifier.
 * @returns The parsed dependency, or `undefined` if the URL is invalid. */
export function tryParse(url: string | URL): Dependency | undefined {
  try {
    return parse(url);
  } catch {
    return;
  }
}

/**
 * Convert the given dependency to a URL string.
 * @example
 * stringify({
 *   protocol: "https:",
 *   name: "deno.land/std",
 *   version: "1.0.0",
 *   path: "/fs/mod.ts",
 * }); // -> "https://deno.land/std@1.0.0/fs/mod.ts"
 */
export function stringify(
  dependency: Dependency,
  include: { protocol?: boolean; version?: boolean; path?: boolean } = {},
): string {
  include = { protocol: true, version: true, path: true, ...include };
  const toHeader = (protocol: string) => {
    switch (protocol) {
      case "http:":
      case "https:":
        return protocol + "//";
      default:
        return protocol;
    }
  };
  const header = include.protocol ? toHeader(dependency.protocol) : "";
  const version = include.version
    ? dependency.version ? "@" + dependency.version : ""
    : "";
  const path = include.path ? dependency.entrypoint : "";

  return `${header}${dependency.name}${version}` + path;
}

/** Type of the source of the dependency. */
export type SourceType = "module" | "import_map";

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
> = T extends "module" ? { span: RangeJson }
  : T extends "import_map" ? { key: string }
  : never;

/** Representation of a reference to a dependency. */
export interface DependencyReference<
  T extends SourceType = SourceType,
> extends Dependency {
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

/**
 * Collect dependencies from the given ES module(s), sorted by name.
 * @param paths The path to the ES module(s) to collect dependencies from.
 * @param options The options to customize the collection process.
 */
export async function collectFromEsModules(
  paths: string | URL | (string | URL)[],
  options: CollectFromModuleOptions = {},
): Promise<DependencyReference<"module">[]> {
  const urls = [paths].flat().map(toUrl);
  const graph = await createGraphLocally(urls, options);

  const deps: DependencyReference<"module">[] = [];
  graph.modules.forEach((mod) =>
    mod.dependencies?.forEach((json) => {
      const dep = fromDependencyJson(json, mod.specifier);
      if (dep) deps.push(dep);
    })
  );
  return deps.sort(compareNames);
}

function fromDependencyJson(
  json: DependencyJson,
  referrer: string,
): DependencyReference<"module"> | undefined {
  const specifier = json.specifier;
  const url = json.code?.specifier ?? json.type?.specifier;
  const { span } = json.code ?? json.type ?? {};
  if (url && span) {
    return {
      specifier,
      ...parse(url),
      source: { type: "module", url: referrer, span },
    };
  }
}

const compareNames = (a: Dependency, b: Dependency) =>
  a.name.localeCompare(b.name);

/** Collect dependencies from the given import map file, or a Deno configuration
 * file, sorted lexically by name. */
export async function collectFromImportMap(
  path: string | URL,
): Promise<DependencyReference<"import_map">[]> {
  const url = toUrl(path);
  const json = await readImportMapJson(path);
  return Object.entries(json.imports).map((
    [key, specifier],
  ): DependencyReference<"import_map"> => ({
    specifier,
    ...parse(specifier),
    source: { type: "import_map", url, key },
  })).sort(compareNames);
}
