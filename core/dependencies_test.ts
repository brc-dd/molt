import * as fs from "@chiezo/amber/fs";
import { assert, assertObjectMatch } from "@std/assert";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "@std/testing/bdd";
import { collectFromEsModules } from "./dependencies.ts";
import dedent from "dedent";

describe("collectFromEsModules", () => {
  beforeAll(() => {
    Deno.chdir(new URL(".", import.meta.url));
  });

  beforeEach(() => {
    fs.stub(".");
    fs.mock();
  });

  afterEach(() => {
    fs.dispose();
  });

  it("should collect dependencies from a ES module", async () => {
    await Deno.writeTextFile(
      "mod.ts",
      dedent`
        import { assert } from "jsr:@std/assert@0.222.0";
        import { copy } from "https://deno.land/std@0.222.0/bytes/copy.ts";
      `,
    );
    const actual = await collectFromEsModules("mod.ts");
    // Results should be sorted by the lexical order of the names.
    assertObjectMatch(actual[0], {
      url: "jsr:@std/assert@0.222.0",
      protocol: "jsr:",
      name: "@std/assert",
      version: "0.222.0",
      entrypoint: "",
      specifier: "jsr:@std/assert@0.222.0",
      map: undefined,
      referrer: {
        span: {
          start: { line: 0, character: 23 },
          end: { line: 0, character: 48 },
        },
      },
    });
    assert(actual[0].referrer.url.endsWith("mod.ts"));
    assertObjectMatch(actual[1], {
      url: "https://deno.land/std@0.222.0/bytes/copy.ts",
      protocol: "https:",
      name: "deno.land/std",
      version: "0.222.0",
      entrypoint: "/bytes/copy.ts",
      specifier: "https://deno.land/std@0.222.0/bytes/copy.ts",
      map: undefined,
      referrer: {
        span: {
          start: { line: 1, character: 21 },
          end: { line: 1, character: 66 },
        },
      },
    });
    assert(actual[1].referrer.url.endsWith("mod.ts"));
  });

  it("should collect dependencies from multiple ES modules", async () => {
    await Deno.writeTextFile(
      "a.ts",
      dedent`
        import { assert } from "jsr:@std/assert@0.222.0";
      `,
    );
    await Deno.writeTextFile(
      "b.ts",
      dedent`
        import { copy } from "https://deno.land/std@0.222.0/bytes/copy.ts";
      `,
    );
    const actual = await collectFromEsModules(["a.ts", "b.ts"]);
    assertObjectMatch(actual[0], {
      url: "jsr:@std/assert@0.222.0",
      protocol: "jsr:",
      name: "@std/assert",
      version: "0.222.0",
      entrypoint: "",
      specifier: "jsr:@std/assert@0.222.0",
      map: undefined,
      referrer: {
        span: {
          start: { line: 0, character: 23 },
          end: { line: 0, character: 48 },
        },
      },
    });
    assert(actual[0].referrer.url.endsWith("a.ts"));
    assertObjectMatch(actual[1], {
      url: "https://deno.land/std@0.222.0/bytes/copy.ts",
      protocol: "https:",
      name: "deno.land/std",
      version: "0.222.0",
      entrypoint: "/bytes/copy.ts",
      specifier: "https://deno.land/std@0.222.0/bytes/copy.ts",
      map: undefined,
      referrer: {
        span: {
          start: { line: 0, character: 21 },
          end: { line: 0, character: 66 },
        },
      },
    });
    assert(actual[1].referrer.url.endsWith("b.ts"));
  });
});
