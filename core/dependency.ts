import type { DependencyJson } from "@deno/graph/types";
import { toUrl } from "@molt/lib/path";
import { assertExists } from "@std/assert";
import * as SemVer from "@std/semver";
import { createGraphLocally } from "./graph.ts";
import { readImportMapJson } from "./import_map.ts";

/** Parsed components of a dependency specifier. */
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

/** Convert the given protocol to a full URL scheme. */
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

/** Representation of a dependency found in the source code or an import map. */
export interface Dependency<
  T extends SourceType = SourceType,
> extends DependencyComps {
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
): Promise<Dependency<"module">[]> {
  const urls = [paths].flat().map(toUrl);
  const graph = await createGraphLocally(urls, options);

  const deps: Dependency<"module">[] = [];
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
): Dependency<"module"> | undefined {
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
): Promise<Dependency<"import_map">[]> {
  const url = toUrl(path);
  const json = await readImportMapJson(path);
  return Object.entries(json.imports).map((
    [key, specifier],
  ): Dependency<"import_map"> => ({
    specifier,
    ...parse(specifier),
    source: { type: "import_map", url, key },
  })).sort(compareNames);
}

/**
 * Try resolving the latest version of the given dependency.
 *
 * @returns The latest version of the given dependency, or `undefined` if the
 * latest version of dependency is unable to resolve.
 *
 * @throws An error if the dependency is not found in the registry.
 *
 * @example
 * await resolveLatestVersion(
 *   Dependency.parse(new URL("https://deno.land/std@0.220.0/bytes/copy.ts"))
 * );
 * // -> "0.224.0"
 */
export async function getLatestVersion(
  dependency: Dependency,
): Promise<string | undefined> {
  const releases = await getReleases(dependency);
  return findLatest(releases);
}

async function getReleases(dependency: Dependency): Promise<string[]> {
  switch (dependency.protocol) {
    case "npm:":
      return getNpmReleases(dependency);
    case "jsr:":
      return getJsrReleases(dependency);
  }
  const latest = await getRemoteLatestVersion(dependency);
  return latest ? [latest] : [];
}

async function getNpmReleases(dependency: Dependency): Promise<string[]> {
  const res = await fetch(
    `https://registry.npmjs.org/${dependency.name}`,
  );
  if (!res.ok) {
    throw new Deno.errors.Http(`${res.statusText}: ${res.url}`);
  }
  const isNpmPackageMeta = is.ObjectOf({
    versions: is.RecordOf(
      is.ObjectOf({ version: is.String }),
      is.String,
    ),
  });
  const meta = ensure(await res.json(), isNpmPackageMeta);
  return Object.keys(meta.versions);
}

async function getJsrReleases(dependency: Dependency): Promise<string[]> {
  const res = await fetch(
    `https://jsr.io/${dependency.name}/meta.json`,
  );
  if (!res.ok) {
    throw new Deno.errors.Http(`${res.statusText}: ${dependency.name}`);
  }
  const isJsrPackageMeta = is.ObjectOf({
    versions: is.RecordOf(
      is.ObjectOf({ yanked: is.OptionalOf(is.LiteralOf(true)) }),
      is.String,
    ),
  });
  const meta = ensure(await res.json(), isJsrPackageMeta);
  return Object.keys(filterValues(meta.versions, (it) => !it.yanked));
}

async function getRemoteLatestVersion(
  dependency: Dependency,
): Promise<string | undefined> {
  const response = await fetch(stringify(dependency), { method: "HEAD" });

  // We don't need the body, just the headers.
  await response.arrayBuffer();

  if (!response.redirected) {
    return;
  }
  return parse(response.url).version;
}

/** Find the latest non-pre-release version from the given list of versions. */
function findLatest(versions: string[]): string | undefined {
  const latest = mapNotNullish(versions, SemVer.tryParse)
    .filter((semver) => !semver.prerelease)
    .sort(SemVer.compare).reverse().at(0);
  if (latest) {
    return SemVer.format(latest);
  }
}
