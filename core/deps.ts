import { assertExists } from "@std/assert";
import { dirname } from "@std/path";

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
  /** The URL protocol of the dependency specifier.
   * @example "jsr:", "npm:", "https:" */
  protocol: DependencyProtocol<T>;
  /** The name of the dependency, or a string between the protocol and version.
   * @example "deno.land/std" */
  name: string;
  /** The version string of the dependency.
   * @example "0.205.0" */
  version?: string;
}

/**
 * Parse components of the dependency from the given specifier.
 * @example
 * const { name, version, path } = Dependency.parse(
 *   new URL("https://deno.land/std@0.200.0/fs/mod.ts")
 * );
 * // -> { protocol: "https:", name: "deno.land/std", version: "0.200.0" }
 */
export function parse(specifier: string | URL): Dependency {
  specifier = new URL(specifier);
  const protocol = specifier.protocol;
  if (!isDependencyProtocol(protocol)) {
    throw new Error(`Invalid protocol: ${protocol}`);
  }
  const body = specifier.hostname + specifier.pathname;
  // Try to find a path segment like "<name>@<version>/"
  const matched = body.match(/^(?<name>.+)@(?<version>[^/]+)/);
  if (matched) {
    assertExists(matched.groups);
    const { name, version } = matched.groups;
    return {
      protocol,
      // jsr specifier may have a leading slash. e.g. jsr:/@std/testing^0.222.0/bdd
      name: name.startsWith("/") ? name.slice(1) : name,
      version,
    };
  }
  return { protocol, name: dirname(body) };
}

/**
 * Convert the given dependency to a URL string.
 * @example
 * stringify({
 *   protocol: "https:",
 *   name: "deno.land/std",
 *   version: "1.0.0",
 * }); // -> "https://deno.land/std@1.0.0"
 */
export function stringify(
  dep: Dependency,
  include: { protocol?: boolean; version?: boolean } = {},
): string {
  const toHeader = (protocol: string) =>
    protocol.startsWith("http") ? protocol + "//" : protocol;
  const header = (include.protocol ?? true) ? toHeader(dep.protocol) : "";
  const version = (include.version ?? true) ? "@" + dep.version : "";
  return `${header}${dep.name}${version}`;
}
