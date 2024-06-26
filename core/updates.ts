import { ensure, is } from "@core/unknownutil";
import { filterValues, mapNotNullish, maxWith } from "@std/collections";
import * as SemVer from "@std/semver";
import { type Dependency, parse, stringify } from "./deps.ts";
import { assertOk } from "./internal.ts";
import { assertExists } from "@std/assert";

export interface DependencyUpdate {
  /** The latest version that satisfies the constraint. */
  constrainted: string;
  /** The latest version that is not a pre-release */
  released?: string;
  /** The latest version available, including pre-releases or whatever. */
  latest: string;
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
): Promise<DependencyUpdate> {
  return dep.kind.startsWith("http")
    ? getRemoteUpdate(dep as Dependency<"http" | "https">)
    : getPackageUpdate(dep as Dependency<"jsr" | "npm">);
}

async function getRemoteUpdate(
  dep: Dependency<"http" | "https">,
): Promise<DependencyUpdate> {
  const constrainted = dep.constraint;
  const latest = await getRemoteLatestVersion(dep);
  const semver = SemVer.tryParse(latest);
  if (semver) {
    const released = !semver.prerelease?.length
      ? SemVer.format(semver)
      : undefined;
    return { constrainted, released, latest };
  }
  return { constrainted, latest };
}

async function getRemoteLatestVersion(
  dep: Dependency<"http" | "https">,
): Promise<string> {
  const url = stringify(dep, "kind", "name", "path");
  const res = await fetch(url, { method: "HEAD" });

  // We don't need the body, just the headers.
  await res.arrayBuffer();

  // We expect a redirect to the latest version.
  if (!res.redirected) {
    return dep.constraint;
  }
  return parse(res.url).constraint;
}

async function getPackageUpdate(
  dep: Dependency<"jsr" | "npm">,
): Promise<DependencyUpdate> {
  const versions = await getVersions(dep);
  const semvers = mapNotNullish(versions, SemVer.tryParse);

  const latest = maxWith(semvers, SemVer.compare);
  assertExists(latest, `No SemVers found for ${dep.name}`);

  const releases = semvers.filter((it) => !it.prerelease?.length);
  const released = maxWith(releases, SemVer.compare);

  const range = SemVer.tryParseRange(dep.constraint);
  const constrainted = range && SemVer.maxSatisfying(semvers, range);
  assertExists(
    constrainted,
    `No version of ${dep.name} satisfies ${dep.constraint}`,
  );
  return {
    constrainted: SemVer.format(constrainted),
    released: released && SemVer.format(released),
    latest: SemVer.format(latest),
  };
}

function getVersions(dep: Dependency<"jsr" | "npm">): Promise<string[]> {
  switch (dep.kind) {
    case "npm":
      return getNpmVersions(dep as Dependency<"npm">);
    case "jsr":
      return getJsrVersions(dep as Dependency<"jsr">);
  }
}

async function getNpmVersions(dep: Dependency<"npm">): Promise<string[]> {
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

async function getJsrVersions(dep: Dependency<"jsr">): Promise<string[]> {
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
