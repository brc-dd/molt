import * as fs from "@chiezo/amber/fs";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import dedent from "dedent";
import { collectFromImportMap, collectFromEsModules } from "./refs.ts";

const url = (f: string) => "file://" + join(Deno.cwd(), f);

describe("fromEsModules", () => {
  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should collect dependencies from an ES module", async () => {
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
        dependency: {
          kind: "jsr",
          name: "@std/assert",
          constraint: "0.222.0",
        },
        source: {
          specifier: url("a.ts"),
          kind: "esm",
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 48 },
          },
        },
      },
      {
        dependency: {
          kind: "https",
          name: "deno.land/std",
          constraint: "0.222.0",
          path: "/bytes/copy.ts",
        },
        source: {
          specifier: url("a.ts"),
          kind: "esm",
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
        dependency: {
          kind: "jsr",
          name: "@std/assert",
          constraint: "0.222.0",
        },
        source: {
          specifier: url("a.ts"),
          kind: "esm",
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 48 },
          },
        },
      },
      {
        dependency: {
          kind: "https",
          name: "deno.land/std",
          constraint: "0.222.0",
          path: "/bytes/copy.ts",
        },
        source: {
          specifier: url("b.ts"),
          kind: "esm",
          span: {
            start: { line: 0, character: 21 },
            end: { line: 0, character: 66 },
          },
        },
      },
    ]);
  });

  it.ignore("should collect dependencies mapped with import maps", async () => {
    await Deno.writeTextFile(
      "a.ts",
      dedent`
        import { assert } from "@std/assert";
      `,
    );
    await Deno.writeTextFile(
      "a.json",
      dedent`
        {
          "imports": {
            "@std/assert": "jsr:@std/assert@^0.222.0"
          }
        }
      `,
    );
    const actual = await collectFromEsModules("a.ts", { imports: "a.json" });
    assertEquals(actual, [
      {
        dependency: {
          kind: "jsr",
          name: "@std/assert",
          constraint: "^0.222.0",
        },
        source: {
          specifier: url("a.ts"),
          kind: "esm",
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 38 },
          },
        },
      },
    ]);
  });
});

describe("collectFromImportMap", () => {
  beforeEach(() => fs.mock());
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
        dependency: {
          kind: "jsr",
          name: "@std/assert",
          constraint: "^0.222.0",
        },
        source: {
          kind: "import_map",
          specifier: url("a.json"),
          key: "@std/assert",
        },
      },
      {
        dependency: {
          kind: "jsr",
          name: "@std/testing",
          constraint: "^0.222.0",
          path: "/bdd",
        },
        source: {
          kind: "import_map",
          specifier: url("a.json"),
          key: "@std/testing/bdd",
        },
      },
    ]);
  });
});
