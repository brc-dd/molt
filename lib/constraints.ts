import * as SemVer from "@std/semver";
import { assert, unreachable } from "@std/assert";

/**
 * Increase a version constraint to satisfy the given version.
 *
 * @param constraint The current version constraint.
 * @param version The version to satisfy.
 * @returns The increased version constraint.
 */
export function increase(
  constraint: string,
  version: string,
): string {
  try {
    return _increase(constraint, version);
  } catch {
    throw new Error(`Unexpected format of version constraint: ${constraint}`);
  }
}

function _increase(
  constraint: string,
  version: string,
): string {
  const range = SemVer.parseRange(constraint);
  assert(range.length === 1);

  const target = SemVer.parse(version);

  if (SemVer.satisfies(target, range)) {
    return constraint;
  }

  const comparators = range[0];

  if (comparators.length === 1 && comparators[0].operator === undefined) {
    // An equality constraint
    return version;
  }

  const lower = comparators.find((it) => it.operator === ">=");
  assert(lower);

  const upper = comparators.find((it) => it.operator === "<");
  assert(upper);

  if (constraint.startsWith("^")) {
    if (target.major) {
      return `^${target.major}.0.0`;
    }
    if (target.minor) {
      return `^0.${target.minor}.0`;
    }
    return `^0.0.${target.patch}`;
  }

  if (constraint.startsWith("~")) {
    if (target.major) {
      return `~${target.major}.${target.minor}.0`;
    }
    return `~${target.major}.${target.minor}.${target.patch}`;
  }

  unreachable();
}
