import { ensure, is } from "@core/unknownutil";
import { createGraph } from "@deno/graph";
import { filterValues, mapEntries, pick } from "@std/collections";
import {
  instantiate,
  type Lockfile,
  type LockfileJson,
  type NpmPackageInfo,
} from "./deno_lockfile/js/mod.ts";
import {
  Dependency,
  isDependency,
  isRemote,
  parse,
  stringify,
} from "./deps.ts";
import { assertOk, checksum } from "./internal.ts";
import { getUpdate } from "./updates.ts";

export type { LockfileJson };

const { parseFromJson } = await instantiate();

const MOLT_VERSION =
  (await import("./deno.json", { with: { type: "json" } })).default.version;

const LOCKFILE_VERSION = "3";

export interface CreateLockParams {
  increase?: string;
  lock: string;
}

/**
 * Create a new partial lock for the given dependency updated.
 *
 * @param dependency The dependency to create the lock for.
 * @param target The target version to update the dependency to.
 */
export function createLock(
  dependency: Dependency,
  target: string,
): Promise<LockfileJson> {
  return isRemote(dependency)
    ? createRemoteLock(dependency)
    : createPackageLock(dependency as Dependency<"jsr" | "npm">, target);
}

async function createRemoteLock(
  dep: Dependency<"http" | "https">,
): Promise<LockfileJson> {
  const lockfile = parseFromJson("", {
    version: LOCKFILE_VERSION,
    remote: {},
  });
  const graph = await createGraph(stringify(dep));
  const deps = graph.modules.map((mod) => mod.specifier);
  for (const dep of deps) {
    const res = await fetch(dep);
    assertOk(res);
    lockfile.insertRemote(dep, await checksum(await res.arrayBuffer()));
  }
  return lockfile.toJson();
}

async function createPackageLock(
  dep: Dependency<"jsr" | "npm">,
  target: string,
): Promise<LockfileJson> {
  const required = { ...dep, path: "" };
  const lockfile = parseFromJson("", {
    version: LOCKFILE_VERSION,
    remote: {},
    workspace: {
      dependencies: [
        stringify(required),
      ],
    },
  });
  await insertPackage(lockfile, required, target);
  return lockfile.toJson();
}

function insertPackage(
  lock: Lockfile,
  required: Dependency<"jsr" | "npm">,
  target: string,
  insertSpecifier: boolean = true,
): Promise<void> {
  const locked = { ...required, constraint: target };
  if (insertSpecifier) {
    lock.insertPackageSpecifier(stringify(required), stringify(locked));
  }
  const specifier = stringify(locked, "name", "constraint");
  if (required.kind === "jsr") {
    return insertJsrPackage(lock, specifier, locked as Dependency<"jsr">);
  } else {
    return insertNpmPackage(lock, specifier, locked as Dependency<"npm">);
  }
}

async function insertJsrPackage(
  lock: Lockfile,
  specifier: string,
  dependency: Dependency<"jsr">,
): Promise<void> {
  lock.insertPackage(
    specifier,
    await getJsrPackageIntegrity(dependency),
  );
  const deps = await getJsrDependencies(dependency);
  lock.addPackageDeps(
    specifier,
    deps.map((dep) => stringify(dep, "kind", "name", "constraint")),
  );
  for (const dep of deps) {
    dep.path = "";
    const update = await getUpdate(dep);
    const target = update?.constrainted ?? dep.constraint;
    await insertPackage(lock, dep, target);
  }
}

async function insertNpmPackage(
  lock: Lockfile,
  specifier: string,
  dependency: Dependency<"npm">,
): Promise<void> {
  const info = await getNpmPackageInfo(dependency);
  lock.insertNpmPackage(specifier, info);
  const deps = Object.values(info.dependencies).map((dep) =>
    parse(`npm:${dep}`) as Dependency<"npm">
  );
  for (const dep of deps) {
    const update = await getUpdate(dep);
    const target = update?.constrainted ?? dep.constraint;
    await insertPackage(lock, dep, target, false);
  }
}

async function getJsrPackageIntegrity(
  dep: Dependency<"jsr">,
): Promise<string> {
  const { name, constraint: version } = dep;
  const res = await fetch(`https://jsr.io/${name}/${version}_meta.json`);
  return checksum(await res.arrayBuffer());
}

async function getNpmPackageInfo(
  dep: Dependency<"npm">,
): Promise<NpmPackageInfo> {
  const { name, constraint: version } = dep;
  const res = await fetch(
    `https://registry.npmjs.org/${name}/${version}`,
  );
  assertOk(res);
  const info = ensure(
    await res.json(),
    is.ObjectOf({
      dist: is.ObjectOf({
        integrity: is.String,
      }),
      dependencies: is.OptionalOf(is.RecordOf(is.String, is.String)),
    }),
  );
  return {
    integrity: info.dist.integrity,
    dependencies: mapEntries(
      info.dependencies ?? {},
      ([name, version]) => [name, `${name}@${version}`],
    ),
  };
}

async function getJsrDependencies(
  dep: Dependency<"jsr">,
): Promise<Dependency<"jsr" | "npm">[]> {
  const { constraint: version } = dep;
  const [scope, name] = dep.name.slice(1).split("/");
  const res = await fetch(
    `https://api.jsr.io/scopes/${scope}/packages/${name}/versions/${version}/dependencies`,
    {
      headers: {
        "User-Agent": `molt/${MOLT_VERSION}; https://jsr.io/@molt`,
      },
    },
  );
  assertOk(res);
  return ensure(
    await res.json(),
    is.ArrayOf(isDependency),
  ) as Dependency<"jsr" | "npm">[];
}

/**
 * Extract the partial lock for the given JSR or NPM package from a lockfile.
 *
 * @param lockfile The `Lockfile` object to extract the partial lock for the dependency from.
 * @param dependency The dependency to extract the partial lock for.
 * @returns The `LockfileJson` object representing the partial lock.
 *
 * @example
 * ```ts
 * const lockfile = await readLockFile("deno.lock");
 * extractPackage("jsr:@std/testing@^0.222.0", lockfile);
 * ```
 */
export async function extract(
  lockfile: LockfileJson,
  dependency: Dependency,
): Promise<LockfileJson> {
  return isRemote(dependency)
    ? await extractRemote(lockfile, dependency)
    : extractPackage(lockfile, dependency as Dependency<"jsr" | "npm">);
}

async function extractRemote(
  lock: LockfileJson,
  dep: Dependency<"http" | "https">,
): Promise<LockfileJson> {
  const graph = await createGraph(stringify(dep));
  const deps = graph.modules.map((mod) => mod.specifier);
  return {
    version: LOCKFILE_VERSION,
    remote: filterValues(
      pick(lock.remote, deps),
      (hash) => hash !== undefined,
    ),
  };
}

function extractPackage(
  lock: LockfileJson,
  dep: Dependency<"jsr" | "npm">,
): LockfileJson {
  const name = stringify(dep, "kind", "name", "constraint");
  const lockfile = parseFromJson("", lock);
  lockfile.setWorkspaceConfig({ dependencies: [name] });
  return {
    version: LOCKFILE_VERSION,
    ...pick(lockfile.toJson(), ["packages", "workspace"]),
    remote: {},
  };
}

interface LockfileDeletion {
  packages?: {
    specifiers?: string[];
    jsr?: string[];
    npm?: string[];
  };
  remote?: string[];
}
