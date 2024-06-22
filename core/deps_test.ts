import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parse, stringify } from "./deps.ts";

describe("parse", () => {
  it("deno.land/std", () => {
    assertEquals(
      parse("https://deno.land/std@0.1.0/assert/mod.ts"),
      {
        name: "deno.land/std",
        version: "0.1.0",
        type: "remote",
        protocol: "https:",
      },
    );
  });

  it("deno.land/std (no semver)", () =>
    assertEquals(
      parse("https://deno.land/std/assert/mod.ts"),
      {
        type: "remote",
        name: "deno.land/std/assert",
        protocol: "https:",
      },
    ));

  it("deno.land/x (with a leading 'v')", () =>
    assertEquals(
      parse("https://deno.land/x/hono@v0.1.0"),
      {
        name: "deno.land/x/hono",
        version: "v0.1.0",
        type: "remote",
        protocol: "https:",
      },
    ));

  it("npm:", () =>
    assertEquals(
      parse("npm:node-emoji@1.0.0"),
      {
        type: "npm",
        name: "node-emoji",
        version: "1.0.0",
        protocol: "npm:",
      },
    ));

  it("cdn.jsdelivr.net/gh", () =>
    assertEquals(
      parse("https://cdn.jsdelivr.net/gh/hasundue/molt@e4509a9/mod.ts"),
      {
        name: "cdn.jsdelivr.net/gh/hasundue/molt",
        version: "e4509a9",
        type: "remote",
        protocol: "https:",
      },
    ));

  it("jsr:", () =>
    assertEquals(
      parse(new URL("jsr:@luca/flag@^1.0.0/flag.ts")),
      {
        name: "@luca/flag",
        version: "^1.0.0",
        type: "jsr",
        protocol: "jsr:",
      },
    ));
});

describe("stringify", () => {
  it("full", () =>
    assertEquals(
      stringify({
        name: "deno.land/std",
        version: "0.1.0",
        type: "remote",
        protocol: "https:",
      }),
      "https://deno.land/std@0.1.0",
    ));

  it("without protocol", () =>
    assertEquals(
      stringify({
        name: "deno.land/std",
        version: "0.1.0",
        type: "remote",
        protocol: "https:",
      }, ["name", "version"]),
      "deno.land/std@0.1.0",
    ));

  it("without version", () =>
    assertEquals(
      stringify({
        name: "deno.land/std",
        version: "0.1.0",
        type: "remote",
        protocol: "https:",
      }, ["protocol", "name"]),
      "https://deno.land/std",
    ));

  it("name only", () =>
    assertEquals(
      stringify({
        name: "deno.land/std",
        version: "0.1.0",
        type: "remote",
        protocol: "https:",
      }, ["name"]),
      "deno.land/std",
    ));
});
