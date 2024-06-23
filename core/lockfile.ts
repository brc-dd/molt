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

const VERSION =
  (await import("./deno.json", { with: { type: "json" } })).default.version;

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
      { ...dependency, path: "" } as Dependency<"jsr" | "npm">,
      update,
    );
}

async function getPackageUpdate(
  lockfile: Lockfile,
  dependency: Dependency<"jsr" | "npm">,
  update: DependencyUpdate,
  options: UpdateOptions = {},
): Promise<UpdatePart> {
  assert(dependency.path === "");
  lockfile = parseFromJson(lockfile.filename, {
    "version": "3",
    remote: {},
    workspace: {
      dependencies: [
        stringify({ ...dependency, path: "" }),
      ],
    },
  });
  const target = {
    ...dependency,
    constraint: update.constrainted ?? update.latest,
  };
  lockfile.insertPackageSpecifier(
    stringify(dependency),
    stringify(target),
  );
  await insertPackage(lockfile, target);

  return { deleted: {}, updated: lockfile.toJson() };
}

async function insertPackage(
  lockfile: Lockfile,
  root: Dependency<"jsr" | "npm">,
): Promise<void> {
  const name = stringify(root, { omit: ["protocol", "path"] });
  if (root.kind === "jsr") {
    lockfile.insertPackage(
      name,
      await getJsrPackageIntegrity(root as Dependency<"jsr">),
    );
  } else {
    lockfile.insertNpmPackage(
      name,
      await getNpmPackageInfo(root as Dependency<"npm">),
    );
  }
  const deps = await getDependencies(root);
  lockfile.addPackageDeps(
    name,
    deps.map((dep) => stringify({ ...dep, path: "" })),
  );
  for (let dep of deps) {
    dep = { ...dep, path: "" };
    const update = await getUpdate(dep);
    const target = update
      ? {
        ...dep,
        constraint: update.constrainted ?? update.latest,
        path: "",
      }
      : dep;
    lockfile.insertPackageSpecifier(
      stringify(dep),
      stringify(target),
    );
    await insertPackage(lockfile, target);
  }
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
): Promise<Dependency<"jsr" | "npm">[]> {
  switch (dependency.kind) {
    case "jsr":
      return getJsrDependencies(dependency as Dependency<"jsr">);
    case "npm":
      return getNpmDependencies(dependency as Dependency<"npm">);
  }
}

async function getJsrPackageIntegrity(
  dependency: Dependency<"jsr">,
): Promise<string> {
  const { name, constraint: version } = dependency;
  const res = await fetch(`https://jsr.io/${name}/${version}_meta.json`);
  // Calculate the sha256 hash of the response json.
  const buf = await crypto.subtle.digest(
    "SHA-256",
    await res.arrayBuffer(),
  );
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
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
): Promise<Dependency<"jsr" | "npm">[]> {
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
  return ensure(
    await res.json(),
    is.ArrayOf(isDependency),
  ) as Dependency<"jsr" | "npm">[];
}

async function getRemoteUpdate(
  lockfile: Lockfile,
  dependency: Dependency<"http" | "https">,
  update: DependencyUpdate,
): Promise<UpdatePart> {
  const before = await extractRemote(dependency, lockfile);
  return { deleted: {}, updated: before };
}
