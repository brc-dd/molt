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
        entrypoint: "/assert/mod.ts",
        type: "remote",
        protocol: "https:",
      },
    );
  });

  it("deno.land/std (no semver)", () => {
    assertEquals(
      parse("https://deno.land/std/assert/mod.ts"),
      {
        name: "deno.land/std/assert/mod.ts",
        type: "remote",
        protocol: "https:",
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
      },
    );
  });

  it("cdn.jsdelivr.net/gh", () => {
    assertEquals(
      parse("https://cdn.jsdelivr.net/gh/hasundue/molt@e4509a9/mod.ts"),
      {
        name: "cdn.jsdelivr.net/gh/hasundue/molt",
        version: "e4509a9",
        entrypoint: "/mod.ts",
        type: "remote",
        protocol: "https:",
      },
    );
  });

  it("jsr:", () => {
    assertEquals(
      parse("jsr:@luca/flag@^1.0.0/flag.ts"),
      {
        name: "@luca/flag",
        version: "^1.0.0",
        entrypoint: "/flag.ts",
        type: "jsr",
        protocol: "jsr:",
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
      "https://deno.land/std@0.1.0/assert/mod.ts",
    );
  });

  it("without protocol", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["protocol"] },
      ),
      "deno.land/std@0.1.0/assert/mod.ts",
    );
  });

  it("without version", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["version"] },
      ),
      "https://deno.land/std/assert/mod.ts",
    );
  });

  it("name only", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["protocol", "version", "entrypoint"] },
      ),
      "deno.land/std",
    );
  });
});
