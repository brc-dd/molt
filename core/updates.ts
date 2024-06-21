import { ensure, is } from "@core/unknownutil";
import { type SemVer } from "@std/semver";
import * as sv from "@std/semver";
import { type Dependency, parse, stringify } from "./dependency.ts";
import { filterValues, mapNotNullish } from "@std/collections";

export interface DependencyUpdate {
  /** The latest version available, including pre-releases or whatever. */
  latest: string;
  /** The latest SemVer that satisfies the constraint. */
  constrainted?: SemVer;
  /** The latest SemVer that is not a pre-release */
  released?: SemVer;
}

/**
 * Try resolving the latest version of the given dep.
 *
 * @returns The latest version of the given dep, or `undefined` if the
 * latest version of dep is unable to resolve.
 *
 * @throws An error if the dep is not found in the registry.
 *
 * @example
 * await resolveLatestVersion(
 *   Dependency.parse(new URL("https://deno.land/std@0.220.0/bytes/copy.ts"))
 * );
 * // -> "0.224.0"
 */
export function getUpdate(
  dep: Dependency,
): Promise<DependencyUpdate | undefined> {
  switch (dep.protocol) {
    case "http:":
    case "https:":
      return getRemoteUpdate(dep as Dependency<"http" | "https">);
    case "jsr:":
    case "npm:":
      return getPackageUpdate(dep as Dependency<"jsr" | "npm">);
  }
}

async function getRemoteUpdate(
  dep: Dependency<"http" | "https">,
): Promise<DependencyUpdate | undefined> {
  const latest = await getRemoteLatestVersion(dep);
  if (latest) {
    const semver = sv.tryParse(latest);
    const released = semver?.prerelease?.length ? semver : undefined;
    return { latest, released };
  }
}

async function getRemoteLatestVersion(
  dep: Dependency<"http" | "https">,
): Promise<string | undefined> {
  const res = await fetch(stringify(dep), { method: "HEAD" });
  assertOk(res);

  // We don't need the body, just the headers.
  await res.arrayBuffer();

  if (!res.redirected) {
    return;
  }
  return parse(res.url).version;
}

async function getPackageUpdate(
  dep: Dependency<"jsr" | "npm">,
): Promise<DependencyUpdate | undefined> {
  const versions = await getVersions(dep);
  const semvers = mapNotNullish(versions, sv.tryParse);

  const range = dep.version ? sv.tryParseRange(dep.version) : undefined;
  const constrainted = range ? sv.maxSatisfying(semvers, range) : undefined;
}

function getVersions(dep: Dependency<"jsr" | "npm">): Promise<string[]> {
  switch (dep.protocol) {
    case "npm:":
      return getNpmReleases(dep as Dependency<"npm">);
    case "jsr:":
      return getJsrReleases(dep as Dependency<"jsr">);
  }
}

async function getNpmReleases(dep: Dependency<"npm">): Promise<string[]> {
  const res = await fetch(
    `https://registry.npmjs.org/${dep.name}`,
  );
  assertOk(res);
  const isNpmPackageMeta = is.ObjectOf({
    versions: is.RecordOf(
      is.ObjectOf({ version: is.String }),
      is.String,
    ),
  });
  const meta = ensure(await res.json(), isNpmPackageMeta);
  return Object.keys(meta.versions);
}

async function getJsrReleases(dep: Dependency<"jsr">): Promise<string[]> {
  const res = await fetch(
    `https://jsr.io/${dep.name}/meta.json`,
  );
  assertOk(res);
  const isJsrPackageMeta = is.ObjectOf({
    versions: is.RecordOf(
      is.ObjectOf({ yanked: is.OptionalOf(is.LiteralOf(true)) }),
      is.String,
    ),
  });
  const meta = ensure(await res.json(), isJsrPackageMeta);
  return Object.keys(filterValues(meta.versions, (it) => !it.yanked));
}

/** Find the latest non-pre-release version from the given list of versions. */
function findLatest(versions: string[]): string | undefined {
  const latest = mapNotNullish(versions, sv.tryParse)
    .filter((semver) => !semver.prerelease?.length)
    .sort(sv.compare).reverse().at(0);
  if (latest) {
    return sv.format(latest);
  }
}

function assertOk(res: Response): void {
  if (!res.ok) {
    throw new Deno.errors.Http(`${res.statusText}: ${res.url}`);
  }
}
