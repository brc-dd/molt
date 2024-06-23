import { assert } from "@std/assert";
import { is } from "@core/unknownutil";

export type DependencyKind = "jsr" | "npm" | "http" | "https";

const isKind = (kind: string): kind is DependencyKind =>
  ["jsr", "npm", "http", "https"].includes(kind);

/** Parsed components of a dependency specifier. */
export interface Dependency<
  K extends DependencyKind = DependencyKind,
> {
  kind: K;
  /** The name of the dependency
   * @example "@std/fs", "hono", "deno.land/std" */
  name: string;
  /** The version constraint string of the dependency.
   * @example "0.222.1", "^0.222.0" */
  constraint: string;
  /** The entrypoint specifier of the dependency.
   * @example "", "/fs/mod.ts" */
  path: string;
}

export const isDependency = is.ObjectOf({
  kind: is.LiteralOneOf(["jsr", "npm", "http", "https"] as const),
  name: is.String,
  constraint: is.String,
  path: is.String,
});

export function isRemote(
  dep: Dependency,
): dep is Dependency<"http" | "https"> {
  return dep.kind === "http" || dep.kind === "https";
}

/**
 * Parse components of the dependency from the given specifier.
 * @example
 * const { name, version, path } = Dependency.parse(
 *   new URL("https://deno.land/std@0.200.0/fs/mod.ts")
 * );
 * // -> { type: "remote", name: "deno.land/std", version: "0.200.0" }
 */
export function parse(specifier: string): Dependency {
  const url = new URL(specifier);

  const kind = url.protocol.slice(0, -1);
  assert(isKind(kind), `Invalid protocol: ${kind}:`);

  const body = url.hostname + url.pathname;
  // Try to find a path segment like "<name>@<version>/"
  const matched = body.match(
    /^(?<name>.+)@(?<constraint>[^/]+)(?<path>\/.*)?$/,
  );
  if (!matched) {
    throw new Error(`Could not parse dependency: ${specifier}`);
  }
  const { name, constraint, path } = matched.groups as {
    name: string;
    constraint: string;
    path?: string;
  };
  return {
    kind,
    // jsr specifier may have a leading slash. e.g. jsr:/@std/testing^0.222.0/bdd
    name: name.startsWith("/") ? name.slice(1) : name,
    constraint,
    path: path ? path : "",
  };
}

/**
 * Try to parse a dependency from a string representation.
 * @returns The parsed dependency, or `undefined` if the specifier is not parsable.
 */
export function tryParse(specifier: string): Dependency | undefined {
  try {
    return parse(specifier);
  } catch {
    return undefined;
  }
}

export interface StringifyOptions {
  omit?: ("protocol" | "constraint" | "path")[];
}

/**
 * Convert the given dependency to a URL string.
 * @example
 * ```ts
 * stringify({
 *   type: "remote",
 *   name: "deno.land/std",
 *   version: "1.0.0",
 *   entrypoint: "/fs/mod.ts",
 * }); // -> "https://deno.land/std@1.0.0/fs/mod.ts"
 * ```
 */
export function stringify(
  dep: Dependency,
  options: StringifyOptions = {},
): string {
  let str = "";
  if (!options.omit?.includes("protocol")) {
    str += dep.kind + ":";
    if (dep.kind.startsWith("http")) str += "//";
  }
  str += dep.name;
  if (!options.omit?.includes("constraint") && dep.constraint) {
    str += `@${dep.constraint}`;
  }
  if (!options.omit?.includes("path") && dep.path) {
    str += dep.path;
  }
  return str;
}
