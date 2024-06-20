import { toPath } from "@molt/lib/path";
import { filterValues, pick } from "@std/collections";
import {
  instantiate,
  type Lockfile,
  type LockfileJson,
} from "./deno_lockfile/js/mod.ts";
import { createGraph } from "@deno/graph";

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
 * @returns The `Lockfile` object representing the partial lock.
 *
 * @example
 * ```typescript
 * const lockfile = await readLockFile("deno.lock");
 * extractPackage("jsr:@std/testing@^0.222.0", lockfile);
 * ```
 */
export function extractPackage(
  name: string,
  lockfile: Lockfile,
): LockfileJson {
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
export async function extractRemote(
  specifier: string,
  lockfile: Lockfile,
): Promise<LockfileJson> {
  const original = lockfile.toJson();
  const graph = await createGraph(specifier);
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
 * Create a new lockfile with the dependencies updated.
 */
export async function collectLockfileUpdates(
  lockfile: LockfileJson,
): Promise<LockfileJson> {
}
