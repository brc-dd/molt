import { omit } from "@std/collections";
import { toPath } from "@molt/lib/path";
import {
  type Lockfile,
  type LockfileJson,
  parseFromJson,
} from "./deno_lockfile/js/mod.ts";

export type { Lockfile, LockfileJson };

/**
 * Create a LockFile object from the given lock file.
 *
 * @param specifier - The URL or path to the lockfile.
 * @returns The parsed `LockFile` object.
 */
export async function readLockFile(
  specifier: URL | string,
): Promise<Lockfile> {
  const path = toPath(specifier);
  return parseFromJson(path, await Deno.readTextFile(path));
}

/**
 * Extract a partial lock for a dependency from a lockfile.
 *
 * @param specifier - The import specifier of the JSR package.
 * @param lockfile - The lockfile to extract a partial lock for the dependency from.
 * @returns The partial lock file for the dependency.
 */
export async function extractJsrPackage(
  specifier: string,
  lockfile: Lockfile,
): Promise<Lockfile> {
  const copy = lockfile.copy();
  copy.setWorkspaceConfig({ dependencies: [specifier] });
  return await parseFromJson(
    copy.filename,
    omit(copy.toJson(), ["remote", "redirects"]),
  );
}
