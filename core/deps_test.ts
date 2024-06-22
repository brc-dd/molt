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
        specifier: "https://deno.land/std@0.1.0/assert/mod.ts",
      },
    );
  });

  it("deno.land/std (no semver)", () => {
    assertEquals(
      parse("https://deno.land/std/assert/mod.ts"),
      {
        name: "deno.land/std/assert",
        type: "remote",
        protocol: "https:",
        specifier: "https://deno.land/std/assert/mod.ts",
      },
    );
  });

  it("deno.land/x (with a leading 'v')", () => {
    assertEquals(
      parse("https://deno.land/x/hono@v0.1.0"),
      {
        name: "deno.land/x/hono",
        version: "v0.1.0",
        type: "remote",
        protocol: "https:",
        specifier: "https://deno.land/x/hono@v0.1.0",
      },
    );
  });

  it("npm:", () => {
    assertEquals(
      parse("npm:node-emoji@1.0.0"),
      {
        name: "node-emoji",
        version: "1.0.0",
        type: "npm",
        protocol: "npm:",
        specifier: "npm:node-emoji@1.0.0",
      },
    );
  });

  it("cdn.jsdelivr.net/gh", () => {
    assertEquals(
      parse("https://cdn.jsdelivr.net/gh/hasundue/molt@e4509a9/mod.ts"),
      {
        name: "cdn.jsdelivr.net/gh/hasundue/molt",
        version: "e4509a9",
        type: "remote",
        protocol: "https:",
        specifier: "https://cdn.jsdelivr.net/gh/hasundue/molt@e4509a9/mod.ts",
      },
    );
  });

  it("jsr:", () => {
    assertEquals(
      parse("jsr:@luca/flag@^1.0.0/flag.ts"),
      {
        name: "@luca/flag",
        version: "^1.0.0",
        type: "jsr",
        protocol: "jsr:",
        specifier: "jsr:@luca/flag@^1.0.0/flag.ts",
      },
    );
  });
});

describe("stringify", () => {
  it("full", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
      ),
      "https://deno.land/std@0.1.0",
    );
  });

  it("without protocol", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["protocol"] },
      ),
      "deno.land/std@0.1.0",
    );
  });

  it("without version", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["version"] },
      ),
      "https://deno.land/std",
    );
  });

  it("name only", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["protocol", "version"] },
      ),
      "deno.land/std",
    );
  });
});
