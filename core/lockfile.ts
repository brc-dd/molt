import { ensure, is } from "@core/unknownutil";
import { createGraph } from "@deno/graph";
import { toPath } from "@molt/lib/path";
import { assert } from "@std/assert";
import { filterValues, pick } from "@std/collections";
import {
  instantiate,
  type Lockfile,
  type LockfileJson,
} from "./deno_lockfile/js/mod.ts";
import { Dependency, isDependency, isRemote, stringify } from "./deps.ts";
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
  const name = stringify(dependency, "kind", "name", "constraint");
  // We must copy the lockfile to avoid mutating the original.
  const copy = lockfile.copy();
  copy.setWorkspaceConfig({ dependencies: [name] });
  return {
    version: "3",
    ...pick(copy.toJson(), ["packages", "workspace"]),
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
  const deps = graph.modules.map((mod) => mod.specifier);
  return {
    version: "3",
    remote: filterValues(
      pick(original.remote, deps),
      (hash) => hash !== undefined,
    ),
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
    : createPackageLock(
      { ...dependency, path: "" } as Dependency<"jsr" | "npm">,
      target,
    );
}

async function createPackageLock(
  dependency: Dependency<"jsr" | "npm">,
  target: string,
): Promise<LockfileJson> {
  assert(dependency.path === "");
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
  if (request.kind === "jsr") {
    lockfile.insertPackage(
      specifier,
      await getJsrPackageIntegrity(identifier as Dependency<"jsr">),
    );
  } else {
    lockfile.insertNpmPackage(
      specifier,
      await getNpmPackageInfo(identifier as Dependency<"npm">),
    );
  }
  const deps = await getDependencies(identifier);
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
  return checksum(await res.arrayBuffer());
}

async function checksum(src: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", src);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Package<T extends "jsr" | "npm"> = T extends "jsr"
  ? { scope: string; name: string }
  : { scope?: string; name: string };

async function getJsrDependencies(
  dependency: Dependency<"jsr">,
): Promise<Dependency<"jsr" | "npm">[]> {
  const { constraint: version } = dependency;
  const { scope, name } = parseScopeAndName(dependency);
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

function parseScopeAndName<T extends "jsr" | "npm">(
  dependency: Dependency<T>,
): Package<T> {
  if (dependency.name.startsWith("@")) {
    const [scope, name] = dependency.name.slice(1).split("/");
    return { scope, name };
  }
  return { name: dependency } as unknown as Package<T>;
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
    lockfile.insertRemote(
      dep,
      await checksum(await res.arrayBuffer()),
    );
  }
  return lockfile.toJson();
}
