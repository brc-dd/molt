import { assertEquals } from "@std/assert";
import { toFileUrl } from "@std/path";
import { afterEach, describe, it } from "@std/testing/bdd";
import { collectFromEsModules } from "./dependencies.ts";
import dedent from "dedent";

describe("collectFromEsModules", () => {
  let modules: string[] = [];

  afterEach(() => {
    modules.forEach((mod) => Deno.removeSync(mod));
    modules = [];
  });

  it("should collect dependencies from a ES module", async () => {
    modules.push(await Deno.makeTempFile());
    await Deno.writeTextFile(
      modules[0],
      dedent`
        import { assert } from "jsr:@std/assert@0.222.0";
        import { copy } from "https://deno.land/std@0.222.0/bytes/copy.ts";
      `,
    );
    const url = toFileUrl(modules[0]).href;
    const actual = await collectFromEsModules(modules[0]);
    assertEquals(actual, [
      {
        url: "https://deno.land/std@0.222.0/bytes/copy.ts",
        protocol: "https:",
        name: "deno.land/std",
        version: "0.222.0",
        entrypoint: "/bytes/copy.ts",
        specifier: "https://deno.land/std@0.222.0/bytes/copy.ts",
        map: undefined,
        referrer: {
          url,
          span: {
            start: { line: 1, character: 21 },
            end: { line: 1, character: 66 },
          },
        },
      },
      {
        url: "jsr:@std/assert@0.222.0",
        protocol: "jsr:",
        name: "@std/assert",
        version: "0.222.0",
        entrypoint: "",
        specifier: "jsr:@std/assert@0.222.0",
        map: undefined,
        referrer: {
          url,
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 48 },
          },
        },
      },
    ]);
  });

  it("should collect dependencies from multiple ES modules", async () => {
    modules.push(await Deno.makeTempFile());
    await Deno.writeTextFile(
      modules[0],
      dedent`
        import { assert } from "jsr:@std/assert@0.222.0";
      `,
    );
    modules.push(await Deno.makeTempFile());
    await Deno.writeTextFile(
      modules[1],
      dedent`
        import { copy } from "https://deno.land/std@0.222.0/bytes/copy.ts";
      `,
    );
    const actual = await collectFromEsModules(modules);
    const urls = modules.map((mod) => toFileUrl(mod).href);
    assertEquals(actual, [
      {
        url: "https://deno.land/std@0.222.0/bytes/copy.ts",
        protocol: "https:",
        name: "deno.land/std",
        version: "0.222.0",
        entrypoint: "/bytes/copy.ts",
        specifier: "https://deno.land/std@0.222.0/bytes/copy.ts",
        map: undefined,
        referrer: {
          url: urls[1],
          span: {
            start: { line: 0, character: 21 },
            end: { line: 0, character: 66 },
          },
        },
      },
      {
        url: "jsr:@std/assert@0.222.0",
        protocol: "jsr:",
        name: "@std/assert",
        version: "0.222.0",
        entrypoint: "",
        specifier: "jsr:@std/assert@0.222.0",
        map: undefined,
        referrer: {
          url: urls[0],
          span: {
            start: { line: 0, character: 23 },
            end: { line: 0, character: 48 },
          },
        },
      },
    ]);
  });
});
