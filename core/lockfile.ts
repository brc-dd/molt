import { match, placeholder as _ } from "@core/match";
import { ensure, is } from "@core/unknownutil";
import { createGraph } from "@deno/graph";
import { toPath } from "@molt/lib/path";
import { filterValues, pick } from "@std/collections";
import {
  instantiate,
  type Lockfile,
  type LockfileJson,
  type NpmPackageInfo,
} from "./deno_lockfile/js/mod.ts";
import { Dependency, isDependency, isRemote, stringify } from "./deps.ts";
import { assertOk, checksum } from "./internal.ts";
import { getUpdate } from "./updates.ts";

const VERSION =
  (await import("./deno.json", { with: { type: "json" } })).default.version;

export type { LockfileJson };

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
 * @param lock - The `Lockfile` object to extract the partial lock for the dependency from.
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
  lock: LockfileJson,
): Promise<LockfileJson> {
  return isRemote(dependency)
    ? await extractRemote(dependency, lock)
    : extractPackage(dependency as Dependency<"jsr" | "npm">, lock);
}

async function extractRemote(
  dep: Dependency<"http" | "https">,
  lock: LockfileJson,
): Promise<LockfileJson> {
  const graph = await createGraph(stringify(dep));
  const deps = graph.modules.map((mod) => mod.specifier);
  return {
    version: "3",
    remote: filterValues(
      pick(lock.remote, deps),
      (hash) => hash !== undefined,
    ),
  };
}

function extractPackage(
  dependency: Dependency<"jsr" | "npm">,
  lock: LockfileJson,
): LockfileJson {
  const name = stringify(dependency, "kind", "name", "constraint");
  const lockfile = parseFromJson("", lock);
  lockfile.setWorkspaceConfig({ dependencies: [name] });
  return {
    version: "3",
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

export interface LockfileUpdateParams {
  increase?: string;
  lock: string;
}

/**
 * Create a new partial lock for the given dependency updated.
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
    version: "3",
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
  dependency: Dependency<"jsr" | "npm">,
  target: string,
): Promise<LockfileJson> {
  dependency = { ...dependency, path: "" };
  const lockfile = parseFromJson("", {
    version: "3",
    remote: {},
    workspace: {
      dependencies: [
        stringify(dependency),
      ],
    },
  });
  await insertPackage(lockfile, dependency, target);
  return lockfile.toJson();
}

async function insertPackage(
  lockfile: Lockfile,
  request: Dependency<"jsr" | "npm">,
  target: string,
) {
  const identifier = {
    ...request,
    constraint: target,
  };
  lockfile.insertPackageSpecifier(
    stringify(request),
    stringify(identifier),
  );
  const specifier = stringify(identifier, "name", "constraint");
  const deps =
    await (request.kind === "jsr"
      ? insertJsrPackage(lockfile, specifier, identifier as Dependency<"jsr">)
      : insertNpmPackage(lockfile, specifier, identifier as Dependency<"npm">));
  lockfile.addPackageDeps(
    specifier,
    deps.map((dep) => stringify(dep, "kind", "name", "constraint")),
  );
  for (const dep of deps) {
    dep.path = "";
    const update = await getUpdate(dep);
    await insertPackage(lockfile, dep, update?.constrainted ?? dep.constraint);
  }
}

async function insertJsrPackage(
  lockfile: Lockfile,
  specifier: string,
  identifier: Dependency<"jsr">,
): Promise<Dependency<"jsr" | "npm">[]> {
  lockfile.insertPackage(
    specifier,
    await getJsrPackageIntegrity(identifier),
  );
  return await getJsrDependencies(identifier);
}

async function insertNpmPackage(
  lockfile: Lockfile,
  specifier: string,
  identifier: Dependency<"npm">,
): Promise<Dependency<"jsr" | "npm">[]> {
  const info = await getNpmPackageInfo(identifier);
  lockfile.insertPackage(specifier, info.integrity);
  return Object.entries(info.dependencies).map(([name, constraint]) => ({
    kind: "npm",
    name,
    constraint,
    path: "",
  }));
}

async function getJsrPackageIntegrity(
  dependency: Dependency<"jsr">,
): Promise<string> {
  const { name, constraint: version } = dependency;
  const res = await fetch(`https://jsr.io/${name}/${version}_meta.json`);
  return checksum(await res.arrayBuffer());
}

async function getNpmPackageInfo(
  dependency: Dependency<"npm">,
): Promise<NpmPackageInfo> {
  const { name, constraint: version } = dependency;
  const res = await fetch(
    `https://registry.npmjs.org/${name}/${version}`,
  );
  assertOk(res);
  const info = match({
    dist: {
      integrity: _("integrity", is.String),
    },
    dependencies: _("dependencies", is.RecordOf(is.String, is.String)),
  }, await res.json());
  if (!info) {
    throw new Error("Unexpected response from npm registry", { cause: res });
  }
  return info;
}

async function getJsrDependencies(
  dependency: Dependency<"jsr">,
): Promise<Dependency<"jsr" | "npm">[]> {
  const { constraint: version } = dependency;
  const { scope, name } = parsePackage(dependency);
  const res = await fetch(
    `https://api.jsr.io/scopes/${scope}/packages/${name}/versions/${version}/dependencies`,
    {
      headers: {
        "User-Agent": `molt/${VERSION}; https://jsr.io/@molt`,
      },
    },
  );
  assertOk(res);
  return ensure(
    await res.json(),
    is.ArrayOf(isDependency),
  ) as Dependency<"jsr" | "npm">[];
}

type Package<T extends "jsr" | "npm"> = T extends "jsr"
  ? { scope: string; name: string }
  : { scope?: string; name: string };

function parsePackage<T extends "jsr" | "npm">(
  dependency: Dependency<T>,
): Package<T> {
  if (dependency.name.startsWith("@")) {
    const [scope, name] = dependency.name.slice(1).split("/");
    return { scope, name };
  }
  return { name: dependency } as unknown as Package<T>;
}
