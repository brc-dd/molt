export type DependencyType = "jsr" | "npm" | "remote";
export type DependencyProtocol<T extends DependencyType = DependencyType> =
  T extends "remote" ? "http:" | "https:" : `${T}:`;

const isDependencyProtocol = (
  protocol: string,
): protocol is DependencyProtocol =>
  ["jsr:", "npm:", "http:", "https:"].includes(protocol);

/** Parsed components of a dependency specifier. */
export interface Dependency<
  T extends DependencyType = DependencyType,
> {
  /** The name of the dependency
   * @example "deno.land/std" */
  name: string;
  /** The version string of the dependency.
   * @example "0.205.0" */
  version?: string;
  /** The entrypoint specifier of the dependency.
   * @example "/fs/mod.ts" */
  entrypoint?: string;
  /** The type of the dependency. */
  type: T;
  /** The protocol of the dependency. */
  protocol: DependencyProtocol<T>;
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
  const protocol = url.protocol;
  if (!isDependencyProtocol(protocol)) {
    throw new Error(`Invalid protocol: ${protocol}`);
  }
  const type = protocol.startsWith("http")
    ? "remote"
    : protocol.slice(0, -1) as DependencyType;
  const body = url.hostname + url.pathname;
  // Try to find a path segment like "<name>@<version>/"
  const matched = body.match(
    /^(?<name>.+)@(?<version>[^/]+)(?<entrypoint>\/.*)?$/,
  );
  if (matched) {
    const { name, version, entrypoint } = matched.groups as {
      name: string;
      version: string;
      entrypoint?: string;
    };
    const dep = {
      // jsr specifier may have a leading slash. e.g. jsr:/@std/testing^0.222.0/bdd
      name: name.startsWith("/") ? name.slice(1) : name,
      version,
      type,
      protocol,
    };
    return entrypoint ? { ...dep, entrypoint } : dep;
  }
  return { name: body, type, protocol };
}

export interface StringifyOptions {
  omit?: ("protocol" | "version" | "entrypoint")[];
}

/**
 * Convert the given dependency to a URL string.
 * @example
 * ```ts
 * stringify({
 *   type: "remote",
 *   name: "deno.land/std",
 *   version: "1.0.0",
 * }); // -> "https://deno.land/std@1.0.0"
 * ```
 */
export function stringify(
  dep: Dependency,
  options: StringifyOptions = {},
): string {
  let str = "";
  if (!options.omit?.includes("protocol")) {
    str += dep.protocol;
    if (dep.type === "remote") str += "//";
  }
  str += dep.name;
  if (!options.omit?.includes("version") && dep.version) {
    str += `@${dep.version}`;
  }
  if (!options.omit?.includes("entrypoint") && dep.entrypoint) {
    str += dep.entrypoint;
  }
  return str;
}
