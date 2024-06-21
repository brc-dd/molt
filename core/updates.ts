import { ensure, is } from "@core/unknownutil";
import * as SemVer from "@std/semver";
import { type Dependency, parse, stringify } from "./dependencies.ts";
import { filterValues, mapNotNullish } from "@std/collections";

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
