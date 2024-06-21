import * as fs from "@chiezo/amber/fs";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import dedent from "dedent";
import { collectFromEsModules, collectFromImportMap } from "./refs.ts";

describe("collectFromEsModules", () => {
  beforeEach(() => {
    fs.stub(".");
    fs.mock();
  });

  afterEach(() => fs.dispose());

  it("should collect dependencies from a ES module", async () => {
    await Deno.writeTextFile(
      "a.ts",
      dedent`
        import { assert } from "jsr:@std/assert@0.222.0";
        import { copy } from "https://deno.land/std@0.222.0/bytes/copy.ts";
      `,
    );
    const actual = await collectFromEsModules("a.ts");
    assertEquals(actual, [
      {
        specifier: "jsr:@std/assert@0.222.0",
        protocol: "jsr:",
        name: "@std/assert",
        version: "0.222.0",
        source: {
          type: "esm",
          url: "file://" + join(Deno.cwd(), "a.ts"),
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 48 },
          },
        },
      },
      {
        specifier: "https://deno.land/std@0.222.0/bytes/copy.ts",
        protocol: "https:",
        name: "deno.land/std",
        version: "0.222.0",
        source: {
          type: "esm",
          url: "file://" + join(Deno.cwd(), "a.ts"),
          span: {
            start: { line: 1, character: 21 },
            end: { line: 1, character: 66 },
          },
        },
      },
    ]);
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
    assertEquals(actual, [
      {
        specifier: "jsr:@std/assert@0.222.0",
        protocol: "jsr:",
        name: "@std/assert",
        version: "0.222.0",
        source: {
          type: "esm",
          url: "file://" + join(Deno.cwd(), "a.ts"),
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 48 },
          },
        },
      },
      {
        specifier: "https://deno.land/std@0.222.0/bytes/copy.ts",
        name: "deno.land/std",
        protocol: "https:",
        version: "0.222.0",
        source: {
          type: "esm",
          url: "file://" + join(Deno.cwd(), "b.ts"),
          span: {
            start: { line: 0, character: 21 },
            end: { line: 0, character: 66 },
          },
        },
      },
    ]);
  });

  it("should ignore dependencies which are supposed to be mapped with import maps", async () => {
    await Deno.writeTextFile(
      "a.ts",
      dedent`
        import { assert } from "@std/assert";
      `,
    );
    const actual = await collectFromEsModules("a.ts");
    assert(actual.length === 0);
  });
});

describe("collectFromImportMap", () => {
  beforeEach(() => {
    fs.stub(".");
    fs.mock();
  });

  afterEach(() => fs.dispose());

  it("should collect dependencies from an import map", async () => {
    await Deno.writeTextFile(
      "a.json",
      dedent`
        {
          "imports": {
            "@std/assert": "jsr:@std/assert@^0.222.0",
            "@std/testing/bdd": "jsr:@std/testing@^0.222.0/bdd",
          }
        }
      `,
    );
    const actual = await collectFromImportMap("a.json");
    assertEquals(actual, [
      {
        specifier: "jsr:@std/assert@^0.222.0",
        protocol: "jsr:",
        name: "@std/assert",
        version: "^0.222.0",
        source: {
          type: "import_map",
          url: "file://" + join(Deno.cwd(), "a.json"),
          key: "@std/assert",
        },
      },
      {
        specifier: "jsr:@std/testing@^0.222.0/bdd",
        protocol: "jsr:",
        name: "@std/testing",
        version: "^0.222.0",
        source: {
          type: "import_map",
          url: "file://" + join(Deno.cwd(), "a.json"),
          key: "@std/testing/bdd",
        },
      },
    ]);
  });
});
