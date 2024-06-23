import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parse, stringify } from "./deps.ts";

describe("parse", () => {
  it("deno.land/std", () => {
    assertEquals(
      parse("https://deno.land/std@0.1.0/assert/mod.ts"),
      {
        kind: "https",
        name: "deno.land/std",
        constraint: "0.1.0",
        path: "/assert/mod.ts",
      },
    );
  });

  it("deno.land/std (no semver)", () => {
    assertThrows(() => parse("https://deno.land/std/assert/mod.ts"));
  });

  it("deno.land/x (with a leading 'v')", () => {
    assertEquals(
      parse("https://deno.land/x/hono@v0.1.0"),
      {
        kind: "https",
        name: "deno.land/x/hono",
        constraint: "v0.1.0",
        path: "",
      },
    );
  });

  it("npm:", () => {
    assertEquals(
      parse("npm:node-emoji@1.0.0"),
      {
        kind: "npm",
        name: "node-emoji",
        constraint: "1.0.0",
        path: "",
      },
    );
  });

  it("cdn.jsdelivr.net/gh", () => {
    assertEquals(
      parse("https://cdn.jsdelivr.net/gh/hasundue/molt@e4509a9/mod.ts"),
      {
        kind: "https",
        name: "cdn.jsdelivr.net/gh/hasundue/molt",
        constraint: "e4509a9",
        path: "/mod.ts",
      },
    );
  });

  it("jsr:", () => {
    assertEquals(
      parse("jsr:@std/fs@^0.222.0/exists"),
      {
        kind: "jsr",
        name: "@std/fs",
        constraint: "^0.222.0",
        path: "/exists",
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
        { omit: ["constraint"] },
      ),
      "https://deno.land/std/assert/mod.ts",
    );
  });

  it("name only", () => {
    assertEquals(
      stringify(
        parse("https://deno.land/std@0.1.0/assert/mod.ts"),
        { omit: ["protocol", "constraint", "path"] },
      ),
      "deno.land/std",
    );
  });
});
