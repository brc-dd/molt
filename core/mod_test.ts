import * as fs from "@chiezo/amber/fs";
import { distinctBy } from "@std/collections";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { parse, getUpdate, collectFromImportMap, identify } from "./mod.ts";

const DENO_JSONC = `{
  // This is a comment
  "imports": {
    "@std/assert": "jsr:@std/assert@^0.222.0",
    "@core/match": "jsr:@core/match@^0.2.0",
  }
}`;

describe("@molt/core", () => {
  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should update dependencies in `deno.jsonc`", async () => {
    await Deno.writeTextFile("deno.jsonc", DENO_JSONC);
    const refs = await collectFromImportMap("deno.jsonc");
    console.log(refs);

    const deps = distinctBy(refs, (ref) => identify(ref.dependency));
    console.log(deps);
  });
});
