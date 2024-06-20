import type { DependencyJson } from "@deno/graph/types";
import { toUrl } from "@molt/lib/path";
import * as SemVer from "@std/semver";
import { createGraphLocally } from "./graph.ts";
import type { ImportMapResolveResult } from "./import_map.ts";
import { assertExists } from "@std/assert";

export interface DependencyComps {
  /** The URL protocol of the dependency specifier.
   * @example "https:", "jsr:", "npm:" */
  protocol: string;
  /** The name of the dependency, or a string between the protocol and version.
   * @example "deno.land/std" */
  name: string;
  /** The version string of the dependency.
   * @example "0.205.0" */
  version?: string;
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
export function parse(url: string | URL): DependencyComps {
  url = new URL(url);
  const protocol = url.protocol;
  const body = url.hostname + url.pathname;

  // Try to find a path segment like "<name>@<version>/"
  const matched = body.match(
    /^(?<name>.+)@(?<version>[^/]+)(?<entrypoint>\/.*)?$/,
  );

  if (matched) {
    assertExists(matched.groups);
    const { name, entrypoint, version } = matched.groups;
    return {
      protocol,
      // jsr specifier may have a leading slash. e.g. jsr:/@std/testing^0.222.0/bdd
      name: name.startsWith("/") ? name.slice(1) : name,
      version,
      entrypoint: entrypoint ?? "",
    };
  }
  return { protocol, name: body, entrypoint: "" };
}

/** Convert the given protocol to a URL scheme. */
function addSeparator(protocol: string): string {
  switch (protocol) {
    case "file:":
    case "http:":
    case "https:":
      return protocol + "//";
    default:
      return protocol;
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
  dependency: DependencyComps,
  include: { protocol?: boolean; version?: boolean; path?: boolean } = {},
): string {
  include = { protocol: true, version: true, path: true, ...include };

  const header = include.protocol ? addSeparator(dependency.protocol) : "";
  const version = include.version
    ? dependency.version ? "@" + dependency.version : ""
    : "";
  const path = include.path ? dependency.entrypoint : "";

  return `${header}${dependency.name}${version}` + path;
}

/** Check if the given dependency has a version range. */
export function hasVersionRange(
  dependency: DependencyComps,
): boolean {
  const constraint = dependency.version
    ? SemVer.tryParseRange(dependency.version)
    : undefined;
  return !!constraint && constraint.flat().length > 1;
}

export type SourceType = "import_map" | "lockfile" | "module";
export type RangeJson = NonNullable<DependencyJson["code"]>["span"];

export interface DependencyMapInfo extends ImportMapResolveResult {
  /** The full path to the import map used to resolve the dependency.
   * @example "/path/to/import_map.json" */
  source: string;
}

export interface DependencyReferrer<S extends SourceType> {
  /** The full path to the module that imports the dependency.
   * @example "file:///path/to/mod.ts" */
  url: string;
  /** The range of the dependency specifier in the source code. */
  span: S extends "module" ? RangeJson : undefined;
}

export interface Dependency<
  S extends SourceType = SourceType,
> extends DependencyComps {
  /** The original specifier of the dependency appeared in the code. */
  specifier: string;
  /** The fully resolved specifier of the dependency. */
  url: string;
  /** Information about the import map used to resolve the dependency. */
  map: S extends "import_map" ? DependencyMapInfo : undefined;
  /** Information about the referrer of the dependency. */
  referrer: DependencyReferrer<S>;
}

export interface CollectOptions {
  /**
   * The path to the import map used to resolve dependencies.
   * @example "/path/to/import_map.json"
   */
  importMap?: string | URL;
}

export interface CollectFromModuleOptions extends CollectOptions {
  /** Whether to resolve local imports and find dependencies recursively.
   * @default true */
  recursive?: boolean;
}

/**
 * Collect dependencies from the given ES module(s).
 */
export async function collectFromEsModules(
  paths: string | URL | (string | URL)[],
  options: CollectFromModuleOptions = {},
) {
  const urls = [paths].flat().map(toUrl);
  const graph = await createGraphLocally(urls, options);

  const deps: Dependency[] = [];
  graph.modules.forEach((mod) =>
    mod.dependencies?.forEach((json) =>
      deps.push(fromDependencyJson(json, mod.specifier))
    )
  );
  return deps.sort((a, b) => a.name.localeCompare(b.name));
}

function fromDependencyJson(
  json: DependencyJson,
  referrer: string,
): Dependency {
  /** The original specifier of the dependency appeared in the code. */
  const specifier = json.specifier;
  /** The fully resolved specifier of the dependency. */
  const url = json.code?.specifier ?? json.type?.specifier;
  if (!url) {
    throw new Error(
      `Could not resolve the dependency specifier: ${specifier}`,
      { cause: json },
    );
  }
  const { span } = json.code ?? json.type ?? {};
  if (!span) {
    throw new Error(
      `Could not find the range of the dependency specifier: ${specifier}`,
      { cause: json },
    );
  }
  return {
    url,
    ...parse(url),
    specifier,
    map: undefined,
    referrer: { url: referrer, span },
  };
}
