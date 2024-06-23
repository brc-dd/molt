import { ensure, is } from "@core/unknownutil";
import { createGraph } from "@deno/graph";
import { toPath } from "@molt/lib/path";
import { assert, assertEquals } from "@std/assert";
import { filterValues, pick } from "@std/collections";
import * as SemVer from "@std/semver";
import {
  instantiate,
  type Lockfile,
  type LockfileJson,
} from "./deno_lockfile/js/mod.ts";
import {
  Dependency,
  isDependency,
  isRemote,
  parse,
  stringify,
} from "./deps.ts";
import { DependencyUpdate, getUpdate } from "./updates.ts";

const VERSION = (await import("./deno.json", { with: { type: "json" } })).default.version;

export type { Lockfile, LockfileJson };

const { parseFromJson } = await instantiate();

/**
 * Create a LockFile object from the given lock file.
 *
 * @param path - The URL or path to the lockfile.
 * @returns The `Lockfile` object abstracting the lockfile.
 */
export async function readLockfile(
  path: URL | string,
): Promise<Lockfile> {
  path = toPath(path);
  return parseFromJson(path, await Deno.readTextFile(path));
}

/**
 * Extract the partial lock for the given JSR or NPM package from a lockfile.
 *
 * @param name - The import requirement of the JSR or NPM package.
 * @param lockfile - The `Lockfile` object to extract the partial lock for the dependency from.
 * @returns The `LockfileJson` object representing the partial lock.
 *
 * @example
 * ```ts
 * const lockfile = await readLockFile("deno.lock");
 * extractPackage("jsr:@std/testing@^0.222.0", lockfile);
 * ```
 */
export async function extract(
  dependency: Dependency,
  lockfile: Lockfile,
): Promise<LockfileJson> {
  return isRemote(dependency)
    ? await extractRemote(dependency, lockfile)
    : extractPackage(dependency as Dependency<"jsr" | "npm">, lockfile);
}

function extractPackage(
  dependency: Dependency<"jsr" | "npm">,
  lockfile: Lockfile,
): LockfileJson {
  const name = stringify(dependency, { omit: ["path"] });
  // We must copy the lockfile to avoid mutating the original.
  const copy = lockfile.copy();
  copy.setWorkspaceConfig({ dependencies: [name] });
  return {
    ...pick(copy.toJson(), ["version", "packages", "workspace"]),
    remote: {},
  };
}

/**
 * Extract the partial lock for the given remote specifier from a lockfile.
 */
async function extractRemote(
  dep: Dependency<"http" | "https">,
  lockfile: Lockfile,
): Promise<LockfileJson> {
  const original = lockfile.toJson();
  const graph = await createGraph(stringify(dep));
  const dependencies = graph.modules.map((mod) => mod.specifier);
  return {
    version: original.version,
    remote: filterValues(
      pick(original.remote, dependencies),
      (hash) => hash !== undefined,
    ),
  };
}

/**
 * Update strategy for the dependency.
 */
export type UpdateStrategy = "auto" | "widen" | "increase" | "lock-only";

export interface UpdateOptions {
  strategy?: UpdateStrategy;
}

/**
 * An update to a dependency in a lockfile.
 */
interface UpdatePart {
  /** The deleted part of partial lockfile for the dependency. */
  deleted: LockfileDeletion;
  /** The updated part of partial lockfile for the dependency. */
  updated: LockfileJson;
}

interface LockfileDeletion {
  packages?: {
    specifiers?: string[];
    jsr?: string[];
    npm?: string[];
  };
  remote?: string[];
}

/**
 * Create a new partial lock for the given dependency updated.
 */
export function getUpdatePart(
  lockfile: Lockfile,
  dependency: Dependency,
  update: DependencyUpdate,
): Promise<UpdatePart> {
  return isRemote(dependency)
    ? getRemoteUpdate(
      lockfile,
      dependency,
      update,
    )
    : getPackageUpdate(
      lockfile,
      dependency as Dependency<"jsr" | "npm">,
      update,
    );
}

async function getPackageUpdate(
  lockfile: Lockfile,
  dependency: Dependency<"jsr" | "npm">,
  update: DependencyUpdate,
  options: UpdateOptions = {},
): Promise<UpdatePart> {
  const before = extractPackage(dependency, lockfile);

  const specifiers: [string, string][] = [];

  const deps = await getDependencies({
    ...dependency,
    constraint: update.constrainted ?? update.latest,
  });
  console.log(deps);

  const specifiers = await mapEntriesAsync(
    before.packages?.specifiers ?? {},
    (entry) => updateSpecifierEntry(entry, dependency, update, options),
  );

  const updated = {
    specifiers,
  };
  return { deleted: {}, updated };
}

/**
 * Get the dependencies of the given package.
 *
 * @example
 * ```ts
 * const deps = await getDependencies(parse("jsr:@std/assert@^0.222.0"));
 * // -> ["jsr:@std/fmt@^0.222.0"]
 * ```
 */
function getDependencies(
  dependency: Dependency<"jsr" | "npm">,
): Promise<string[]> {
  switch (dependency.kind) {
    case "jsr":
      return getJsrDependencies(dependency as Dependency<"jsr">);
    case "npm":
      return getNpmDependencies(dependency as Dependency<"npm">);
  }
}

type Package<T extends "jsr" | "npm"> = T extends "jsr"
  ? { scope: string; name: string }
  : { scope?: string; name: string };

/**
 * Parse the package name to the package object.
 *
 * @example
 * ```ts
 * const pkg = parsePackage("jsr:@std/testing");
 * // -> { scope: "std", name: "testing" }
 * ```
 */
function parsePackage<T extends "jsr" | "npm">(
  dependency: Dependency<T>,
): Package<T> {
  if (dependency.name.startsWith("@")) {
    const [scope, name] = dependency.name.slice(1).split("/");
    return { scope, name };
  }
  return { name: dependency } as unknown as Package<T>;
}

async function getJsrDependencies(
  dependency: Dependency<"jsr">,
): Promise<Dependency[]> {
  const { constraint: version } = dependency;
  assert(SemVer.parseRange(version).length === 1, "Expect an identifier");
  const { scope, name } = parsePackage(dependency);
  const res = await fetch(
    `https://api.jsr.io/scopes/${scope}/packages/${name}/versions/${version}/dependencies`,
    {
      headers: {
        "User-Agent": `molt/${VERSION}; https://jsr.io/@molt`,
      },
    },
  );
  return ensure(await res.json(), is.ArrayOf(isDependency));
}

async function mapEntriesAsync(
  record: Record<string, string>,
  transformer: (entry: [string, string]) => Promise<[string, string]>,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(record).map((entry) => transformer(entry)),
    ),
  );
}

async function updateSpecifierEntry(
  entry: [string, string],
  dependency: Dependency<"jsr" | "npm">,
  update: DependencyUpdate,
  options: UpdateOptions,
): Promise<[string, string]> {
  const req = parse(entry[0]);
  const id = parse(entry[1]);
  assertEquals(req.name, id.name);
  if (req.name === dependency.name) {
    // The entry is the targeting package.
  } else {
    // The entry is a dependency of the targeting package.
  }
  return entry;
}

async function getRemoteUpdate(
  lockfile: Lockfile,
  dependency: Dependency<"http" | "https">,
  update: DependencyUpdate,
): Promise<UpdatePart> {
  const before = await extractRemote(dependency, lockfile);
  return { deleted: {}, updated: before };
}
