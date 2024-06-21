import { ensure, is } from "@core/unknownutil";
import * as SemVer from "@std/semver";
import { type DependencyComps, parse, stringify } from "./dependency.ts";
import { filterValues, mapNotNullish } from "@std/collections";

export interface DependencyUpdate {
  /** The latest version available, including pre-releases. */
  latest: string;
  /** The latest version that satisfies the constraint. */
  constrainted?: string;
  /** The latest version that is not a pre-release. */
  released?: string;
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
export async function getUpdate(
  dep: DependencyComps,
): Promise<string | undefined> {
  const releases = await getVersions(dep);
  console.log(releases);
  return findLatest(releases);
}

async function getVersions(dep: DependencyComps): Promise<string[]> {
  switch (dep.protocol) {
    case "npm:":
      return getNpmReleases(dep);
    case "jsr:":
      return getJsrReleases(dep);
  }
  const latest = await getRemoteLatestVersion(dep);
  return latest ? [latest] : [];
}

async function getNpmReleases(dep: DependencyComps): Promise<string[]> {
  const res = await fetch(
    `https://registry.npmjs.org/${dep.name}`,
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

async function getJsrReleases(dep: DependencyComps): Promise<string[]> {
  const res = await fetch(
    `https://jsr.io/${dep.name}/meta.json`,
  );
  if (!res.ok) {
    throw new Deno.errors.Http(`${res.statusText}: ${dep.name}`);
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
  dep: DependencyComps,
): Promise<string | undefined> {
  const response = await fetch(stringify(dep), { method: "HEAD" });

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
    .filter((semver) => !semver.prerelease?.length)
    .sort(SemVer.compare).reverse().at(0);
  if (latest) {
    return SemVer.format(latest);
  }
}
