import { beforeAll, describe, it } from "@std/testing/bdd";
import { collectFromModules } from "./dependencies.ts";
import { assertEquals } from "@std/assert";

describe("collectFromModules", () => {
  beforeAll(() => {
    Deno.chdir(new URL("../test/fixtures", import.meta.url));
  });

  it("should collect dependencies from a ES module", async () => {
    const actual = await collectFromModules("mod.ts");
    assertEquals(actual, [
      {
        url: "https://deno.land/std@0.222.0/bytes/mod.ts",
        protocol: "https:",
        name: "deno.land/std",
        version: "0.222.0",
        entrypoint: "/bytes/mod.ts",
        specifier: "https://deno.land/std@0.222.0/bytes/mod.ts",
        map: undefined,
        referrer: {
          url: "file:///home/hasundue/molt/test/fixtures/mod.ts",
          span: {
            start: { line: 1, character: 29 },
            end: { line: 1, character: 73 },
          },
        },
      },
    ]);
  });
});
