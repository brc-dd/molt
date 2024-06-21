import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parse, stringify } from "./deps.ts";

describe("parse", () => {
  it("deno.land/std", () => {
    assertEquals(
      parse("https://deno.land/std@0.1.0/assert/mod.ts"),
      {
        protocol: "https:",
        name: "deno.land/std",
        version: "0.1.0",
      },
    );
  });

  it("deno.land/std (no semver)", () =>
    assertEquals(
      parse("https://deno.land/std/assert/mod.ts"),
      {
        protocol: "https:",
        name: "deno.land/std/assert",
      },
    ));

  it("deno.land/x/ (with a leading 'v')", () =>
    assertEquals(
      parse("https://deno.land/x/hono@v0.1.0"),
      {
        protocol: "https:",
        name: "deno.land/x/hono",
        version: "v0.1.0",
      },
    ));

  it("npm:", () =>
    assertEquals(
      parse(
        new URL("npm:node-emoji@1.0.0"),
      ),
      {
        protocol: "npm:",
        name: "node-emoji",
        version: "1.0.0",
      },
    ));

  it("cdn.jsdelivr.net/gh", () =>
    assertEquals(
      parse(
        new URL("https://cdn.jsdelivr.net/gh/hasundue/molt@e4509a9/mod.ts"),
      ),
      {
        protocol: "https:",
        name: "cdn.jsdelivr.net/gh/hasundue/molt",
        version: "e4509a9",
      },
    ));

  it("jsr:", () =>
    assertEquals(
      parse(new URL("jsr:@luca/flag@^1.0.0/flag.ts")),
      {
        protocol: "jsr:",
        name: "@luca/flag",
        version: "^1.0.0",
      },
    ));
});

describe("stringify", () => {
  it("full", () =>
    assertEquals(
      stringify({
        protocol: "https:",
        name: "deno.land/std",
        version: "0.1.0",
      }),
      "https://deno.land/std@0.1.0",
    ));

  it("without protocol", () =>
    assertEquals(
      stringify({
        protocol: "https:",
        name: "deno.land/std",
        version: "0.1.0",
      }, { protocol: false }),
      "deno.land/std@0.1.0",
    ));

  it("without version", () =>
    assertEquals(
      stringify({
        protocol: "https:",
        name: "deno.land/std",
        version: "0.1.0",
      }, { version: false }),
      "https://deno.land/std",
    ));

  it("name only", () =>
    assertEquals(
      stringify({
        protocol: "https:",
        name: "deno.land/std",
        version: "0.1.0",
      }, { protocol: false, version: false }),
      "deno.land/std",
    ));
});
