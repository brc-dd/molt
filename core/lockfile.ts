import { ensure, is } from "@core/unknownutil";
import { toPath } from "@molt/lib/path";
import { assertEquals } from "@std/assert";
import {
  deepMerge,
  distinctBy,
  filterEntries,
  mapNotNullish,
  omit,
  partition,
} from "@std/collections";
import { detect as detectEOL, EOL } from "@std/fs/eol";
import { parse, type UpdatedDependency } from "./dependency.ts";
import type { FileUpdate } from "./file.ts";
import type { DependencyUpdate } from "./update.ts";

// We can't use unknowntuil's `PredicateType` because it results in a
// 'slow type' for `deno publish`, unfortunately.
export interface LockFileJson {
  version: string;
  packages?: {
    specifiers: Record<string, string>;
    jsr?: Record<string, JsrEntry>;
    npm?: Record<string, NpmEntry>;
  };
  remote?: Record<string, string>;
  workspace?: {
    dependencies?: string[];
  };
}

interface JsrEntry {
  integrity: string;
  dependencies?: string[];
}

interface NpmEntry {
  integrity: string;
  dependencies: Record<string, string>;
}

const isLockFileJson = is.ObjectOf({
  version: is.String,
  packages: is.OptionalOf(is.ObjectOf({
    specifiers: is.RecordOf(is.String, is.String),
    jsr: is.OptionalOf(is.RecordOf(
      is.ObjectOf({
        integrity: is.String,
        dependencies: is.OptionalOf(is.ArrayOf(is.String)),
      }),
      is.String,
    )),
    npm: is.OptionalOf(is.RecordOf(
      is.ObjectOf({
        integrity: is.String,
        dependencies: is.RecordOf(is.String, is.String),
      }),
      is.String,
    )),
  })),
  remote: is.OptionalOf(is.RecordOf(is.String, is.String)),
  workspace: is.OptionalOf(is.ObjectOf({
    dependencies: is.OptionalOf(is.ArrayOf(is.String)),
  })),
});

/**
 * A parsed lockfile JSON object.
 * @example
 * ```ts
 * {
 *   version: "3",
 *   packages: {
 *     specifiers: {
 *       "jsr:@core/match@0.1.x": "jsr:@core/match@0.1.9",
 *       "npm:node-emoji@^2": "npm:node-emoji@2.1.3",
 *       "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0"
 *     },
 *   },
 * }
 */

/** An object representing a lockfile. */
export interface LockFile {
  /** The path to the lockfile. */
  path: string;
  /** The parsed lockfile JSON object. */
  data: LockFileJson;
}

/** A partial lock for a specific dependency */
export interface LockPart {
  /** The import specifier of the dependency. */
  specifier: string;
  /** The parsed lockfile JSON object. */
  data: LockFileJson;
}

/**
 * Read, parse, and validate a lockfile.
 *
 * @param specifier - The URL or path to the lockfile.
 * @returns The parsed JSON object of the lockfile.
 */
export function parseLockFileJson(
  content: string,
): LockFileJson {
  try {
    return ensure(JSON.parse(content), isLockFileJson);
  } catch (cause) {
    throw new Error(`Failed to parse lockfile`, { cause });
  }
}

/**
 * Read, parse, and validate a lockfile.
 *
 * @param specifier - The URL or path to the lockfile.
 * @returns The parsed `LockFile` object.
 */
export async function readLockFile(
  specifier: URL | string,
): Promise<LockFile> {
  return {
    path: toPath(specifier),
    data: parseLockFileJson(await Deno.readTextFile(specifier)),
  };
}

//
// Temporary file management
//
interface TempFile {
  path: string;
  [Symbol.asyncDispose](): Promise<void>;
}

async function createTempFile(): Promise<TempFile> {
  const path = await Deno.makeTempFile();
  return {
    [Symbol.asyncDispose]() {
      return Deno.remove(path);
    },
    path,
  };
}

export class CommandError extends Error {}

/**
 * Create a partial lockfile for the given dependency as a temporary file and returns
 * the parsed LockFile object.
 *
 * The implementation here is quite inefficient. We should rather add a JS interface to
 * the `deno_lockfile` crate.
 *
 * @param dependency - The import specifier of dependency to create a lockfile for.
 * @param locked - If given, the resulting lock has the same version as this.
 * @param lockTo - If given, the resulting lock has the same version as this.
 * @returns A promise to the updated lockfile.
 */
export async function createLockPart(
  dependency: string,
  locked?: LockFile | null,
  lockTo?: string,
): Promise<LockPart> {
  // Create a dummy module that only includes the given dependencies.
  const specifier = lockTo ?? locked?.data.packages?.specifiers[dependency] ??
    dependency;
  await using mod = await createTempFile();
  await Deno.writeTextFile(mod.path, `import "${specifier}";\n`);

  // Create a lockfile for the dummy module.
  await using lock = await createTempFile();
  const { code, stderr } = await new Deno.Command("deno", {
    args: [
      "cache",
      "--no-config",
      "--lock-write",
      "--lock",
      lock.path,
      mod.path,
    ],
  }).output();
  if (code !== 0) {
    throw new CommandError(new TextDecoder().decode(stderr));
  }
  const data = parseLockFileJson(await Deno.readTextFile(lock.path));
  if (locked) {
    data.packages!.specifiers[dependency] =
      data.packages!.specifiers[specifier];
    delete data.packages!.specifiers[specifier];
  }
  return {
    specifier: dependency,
    data,
  };
}

/**
 * Create a new lockfile for each dependency and returns a list of them.
 *
 * @param lockfile - The path to the lockfile.
 * @returns A Promise for the LockFile objects of updated lockfiles.
 */
export async function createLockPartForEach(
  lockfile: LockFile,
  update = true,
): Promise<LockPart[]> {
  return await Promise.all(
    Object.entries(lockfile.data.packages?.specifiers ?? {}).map(
      ([specifier, locked]): Promise<LockPart> =>
        createLockPart(update ? specifier : locked),
    ),
  );
}

/**
 * Extract a partial lock file for a dependency from a lock file.
 *
 * @param dependency - The import specifier of the dependency.
 * @param lock - The lockfile to create a partial lock from.
 */
export async function extractLockPart(
  dependency: string,
  lockfile: LockFile,
): Promise<LockPart> {
  const specifier = lockfile.data.packages?.specifiers[dependency];
  if (!specifier) {
    throw new Error(`${dependency} not found in ${lockfile.path}`);
  }
  const lock = await createLockPart(specifier);
  console.log(lock);

  const deps = Object.keys(lock.data.packages?.specifiers ?? {})
    .filter((it) => !it.startsWith(specifier));
  console.log(deps);

  for (const dep of deps) {
    const lock = await extractLockPart(dep, lockfile);
    console.log(lock);
  }

  return lock;
}

/**
 * Collect updates to dependencies in the given lockfile.
 *
 * @param original - The LockFile object for the original lockfile.
 * @param targets - The specifiers of dependencies being updated.
 * @returns The collected updates to dependencies.
 */
export async function collectUpdateFromLockFile(
  original: LockFile,
  ...targets: string[]
): Promise<DependencyUpdate<"lockfile">[]> {
  const patches = targets.length
    ? await Promise.all(targets.map((it) => createLockPart(it)))
    : await createLockPartForEach(original);
  const updates: DependencyUpdate<"lockfile">[] = patches.flatMap((patch) =>
    mapNotNullish(
      Object.entries(patch.data.packages?.specifiers ?? {}),
      ([specifier, locking]) => {
        const locked = original.data.packages?.specifiers[specifier];
        if (locked !== locking) {
          return {
            from: locked ? parse(locked) : undefined,
            to: parse(locking) as UpdatedDependency,
            code: {
              // TODO: Is it justified to use the specifier of the patch here?
              specifier: patch.specifier,
              span: undefined,
            },
            // TODO: Is it justified to use the whole patch here?
            lock: patch.data,
            map: undefined,
            referrer: original.path,
          };
        }
      },
    )
  );
  return distinctBy(updates, (update) => update.to.name)
    .sort((a, b) => a.to.name.localeCompare(b.to.name));
}

/** Write the given lockfile update to the lockfile. */
export async function writeToLockfile(
  update: FileUpdate<"lockfile">,
) {
  const content = await Deno.readTextFile(update.path);
  const original = parseLockFileJson(content);

  for (const dependency of update.dependencies) {
    const specifier = dependency.code.specifier;
    console.log(specifier);

    // An updated partial lockfile for the dependency.
    const patch = dependency.lock;
    console.log(patch);

    /** Specifiers that are only depended by the current dependency. */
    const omitter = createLockFileOmitKeys(specifier, update.locks);
    console.log(omitter);

    if (original.packages && patch.packages) {
      original.packages.specifiers = deepMerge(
        original.packages.specifiers,
        patch.packages.specifiers,
      );
      if (patch.packages.jsr) {
        original.packages.jsr = deepMerge(
          omit(original.packages.jsr ?? {}, omitter.jsr),
          patch.packages.jsr,
          { arrays: "replace" },
        );
      }
      if (patch.packages.npm) {
        original.packages.npm = deepMerge(
          omit(original.packages.npm ?? {}, omitter.npm),
          patch.packages.npm,
        );
      }
    }
    if (patch.remote) {
      original.remote = deepMerge(
        omit(original.remote ?? {}, omitter.remote),
        patch.remote,
      );
    }
  }
  await Deno.writeTextFile(
    update.path,
    JSON.stringify(original, replacer, 2) + (detectEOL(content) ?? EOL),
  );
}

function replacer(
  key: string,
  value: unknown,
) {
  return ["specifiers", "jsr", "npm", "remote"].includes(key) && value
    ? Object.fromEntries(Object.entries(value).sort())
    : value;
}

interface LockFileOmitKeys {
  jsr: string[];
  npm: string[];
  remote: string[];
}

/** Create a list of keys to omit from the original lockfile. */
function createLockFileOmitKeys(
  specifier: string,
  locks: LockPart[],
): LockFileOmitKeys {
  const [relevant, others] = partition(
    locks,
    (it) => it.specifier === specifier,
  );
  assertEquals(relevant.length, 1, specifier);
  const { data: patch } = relevant[0];
  return {
    jsr: Object.keys(patch.packages?.jsr ?? {}).filter((key) =>
      !others.some((part) =>
        Object.keys(part.data.packages?.jsr ?? {}).some((it) => it === key)
      )
    ),
    npm: Object.keys(patch.packages?.npm ?? {}).filter((key) =>
      !others.some((part) =>
        Object.keys(part.data.packages?.npm ?? {}).some((it) => it === key)
      )
    ),
    remote: Object.keys(patch.remote ?? {}).filter((key) =>
      !others.some((part) =>
        Object.keys(part.data.remote ?? {}).some((it) => it === key)
      )
    ),
  };
}
