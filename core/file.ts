import { detect as detectEOL, EOL } from "@std/fs/eol";
import { stringify } from "./dependency.ts";
import { type LockPart, writeToLockfile } from "./lockfile.ts";
import {
  type CollectResult,
  type DependencyUpdate,
  type SourceType,
  sourceTypeOf,
} from "./update.ts";

/**
 * A collection of updates to dependencies associated with a file.
 */
export interface FileUpdate<T extends SourceType = SourceType> {
  /** The full path to the file being updated.
   * @example "/path/to/mod.ts" */
  path: string;
  /** The type of the file being updated. */
  kind: T;
  /** The updates to dependencies associated with the file. */
  dependencies: DependencyUpdate<T>[];
  /** Partial locks used to update a lockfile. */
  locks: LockPart[];
}

export interface WriteOptions {
  onWrite?: (file: FileUpdate) => void | Promise<void>;
}

/**
 * Write the given `CollectResult` to file system.
 * @returns A promise that resolves when all updates are written.
 * @example
 * ```ts
 * await write(updates, {
 *   onWrite: (file) => {
 *     console.log(`Updated ${file.specifier}`);
 *   },
 * });
 * ```
 */
export function write(
  result: CollectResult,
  options: WriteOptions = {},
): Promise<void> {
  return writeFileUpdate(associateByFile(result), options);
}

/**
 * Collect updates to files from the given updates to dependencies.
 * The collected updates are lexically sorted by the url of the file.
 */
export function associateByFile(
  collected: CollectResult,
): FileUpdate[] {
  /** A map from module URLs to dependency updates. */
  const fileToDepsMap = new Map<string, DependencyUpdate[]>();
  for (const dependency of collected.updates) {
    const referrer = dependency.map?.source ?? dependency.referrer;
    const deps = fileToDepsMap.get(referrer) ??
      fileToDepsMap.set(referrer, []).get(referrer)!;
    deps.push(dependency);
  }
  return Array.from(fileToDepsMap.entries()).map((
    [referrer, dependencies],
  ) => {
    const kind = sourceTypeOf(dependencies[0]);
    return {
      path: referrer,
      kind,
      dependencies,
      locks: collected.locks,
    };
  }).sort((a, b) => a.path.localeCompare(b.path)) as FileUpdate[];
}

/**
 * Write the given (array of) FileUpdate to file system.
 */
export async function writeFileUpdate(
  updates: FileUpdate | FileUpdate[],
  options: WriteOptions = {},
) {
  for (const update of [updates].flat()) {
    await writeTo(update);
    await options.onWrite?.(update);
  }
}

function writeTo(update: FileUpdate) {
  switch (update.kind) {
    case "module":
      return writeToModule(update as FileUpdate<"module">);
    case "import_map":
      return writeToImportMap(update as FileUpdate<"import_map">);
    case "lockfile":
      return writeToLockfile(update as FileUpdate<"lockfile">);
  }
}

async function writeToModule(
  update: FileUpdate<"module">,
) {
  const lineToDependencyMap = new Map(
    update.dependencies.map((
      dependency,
    ) => [dependency.code.span.start.line, dependency]),
  );
  const content = await Deno.readTextFile(update.path);
  const eol = detectEOL(content) ?? EOL;
  await Deno.writeTextFile(
    update.path,
    content
      .split(eol)
      .map((line, index) => {
        const dependency = lineToDependencyMap.get(index);
        return dependency
          ? line.replace(
            line.slice(
              dependency.code.span.start.character + 1,
              dependency.code.span.end.character - 1,
            ),
            stringify(dependency.to),
          )
          : line;
      })
      .join(eol),
  );
}

async function writeToImportMap(
  update: FileUpdate<"import_map">,
) {
  let content = await Deno.readTextFile(update.path);
  for (const dependency of update.dependencies) {
    content = content.replaceAll(
      stringify(dependency.from),
      stringify(dependency.to),
    );
  }
  await Deno.writeTextFile(update.path, content);
}
