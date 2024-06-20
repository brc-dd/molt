import { toPath } from "@molt/lib/path";
import { omit } from "@std/collections";
import {
  instantiate,
  type Lockfile,
  type LockfileJson,
} from "./deno_lockfile/js/mod.ts";

export type { Lockfile, LockfileJson };

const wasm = await instantiate();

/**
 * Create a LockFile object from the given lock file.
 *
 * @param path - The URL or path to the lockfile.
 * @returns The `Lockfile` object abstracting the lockfile.
 */
export async function readLockFile(
  path: URL | string,
): Promise<Lockfile> {
  path = toPath(path);
  return wasm.parseFromJson(path, await Deno.readTextFile(path));
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
): Lockfile {
  const copy = lockfile.copy();
  copy.setWorkspaceConfig({ dependencies: [name] });
  return wasm.parseFromJson(
    copy.filename,
    omit(copy.toJson(), ["remote", "redirects"]),
  );
}
