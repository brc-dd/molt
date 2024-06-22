import { ensure, is } from "@core/unknownutil";
import * as SemVer from "@std/semver";
import { type Dependency, parse, stringify } from "./deps.ts";
import { filterValues, mapNotNullish, maxWith } from "@std/collections";

export interface DependencyUpdate {
  /** The latest version available, including pre-releases or whatever. */
  latest: string;
  /** The latest version that satisfies the constraint. */
  constrainted?: string;
  /** The latest version that is not a pre-release */
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
export function getUpdate(
  dep: Dependency,
): Promise<DependencyUpdate | undefined> {
  return dep.type === "remote"
    ? getRemoteUpdate(dep as Dependency<"remote">)
    : getPackageUpdate(dep as Dependency<"jsr" | "npm">);
}

async function getRemoteUpdate(
  dep: Dependency<"remote">,
): Promise<DependencyUpdate | undefined> {
  const latest = await getRemoteLatestVersion(dep);
  if (latest) {
    const semver = SemVer.tryParse(latest);
    if (semver) {
      const released = !semver.prerelease?.length
        ? SemVer.format(semver)
        : undefined;
      return { latest, released };
    }
    return { latest };
  }
}

async function getRemoteLatestVersion(
  dep: Dependency<"remote">,
): Promise<string | undefined> {
  const url = stringify(dep, ["protocol", "name"]);
  const res = await fetch(url, { method: "HEAD" });

  // We don't need the body, just the headers.
  await res.arrayBuffer();

  // We expect a redirect to the latest version.
  if (!res.redirected) {
    return;
  }
  return parse(res.url).version;
}

async function getPackageUpdate(
  dep: Dependency<"jsr" | "npm">,
): Promise<DependencyUpdate | undefined> {
  const versions = await getVersions(dep);
  const semvers = mapNotNullish(versions, SemVer.tryParse);

  const latest = maxWith(semvers, SemVer.compare);
  if (!latest) return;

  const releases = semvers.filter((it) => !it.prerelease?.length);
  const released = maxWith(releases, SemVer.compare);

  if (!dep.version) {
    return {
      latest: SemVer.format(latest),
      released: released && SemVer.format(released),
    };
  }

  const range = SemVer.tryParseRange(dep.version);
  const constrainted = range && SemVer.maxSatisfying(semvers, range);
  return {
    latest: SemVer.format(latest),
    constrainted: constrainted && SemVer.format(constrainted),
    released: released && SemVer.format(released),
  };
}

function getVersions(dep: Dependency<"jsr" | "npm">): Promise<string[]> {
  switch (dep.type) {
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

function assertOk(res: Response): void {
  if (!res.ok) {
    throw new Deno.errors.Http(`${res.statusText}: ${res.url}`);
  }
}
