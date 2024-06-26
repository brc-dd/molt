import * as fs from "@chiezo/amber/fs";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { collectFromImportMap, getUpdate } from "./mod.ts";
import { parse, stringify } from "./deps.ts";
import { assertExists } from "@std/assert";

const DENO_JSONC = `{
  // This is a comment
  "imports": {
    "@std/assert": "jsr:@std/assert@^0.222.0",
    "debug": "npm:debug@^4.3.0"
  }
}`;

const LOCKFILE = `{
  "version": "3",
  "packages": {
    "specifiers": {
      "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.222.0",
      "jsr:@std/fmt@^0.222.0": "jsr:@std/fmt@0.222.0",
      "npm:debug@^4.3.0": "npm:debug@4.3.0"
    },
    "jsr": {
      "@std/assert@0.222.0": {
        "integrity": "cbf00c0d8125a56c087e3d1ea0e638760d47206b30e9d300bad826b811719fc7",
        "dependencies": [
          "jsr:@std/fmt@^0.222.0"
        ]
      },
      "@std/fmt@0.222.0": {
        "integrity": "0eb99babf1cc697d67e76e8753916c037bbc3ce4abcefa321e1465708b0adda1"
      },
    },
    "npm": {
      "debug@4.3.0": {
        "integrity": "sha512-jjO6JD2rKfiZQnBoRzhRTbXjHLGLfH+UtGkWLc/UXAh/rzZMyjbgn0NcfFpqT8nd1kTtFnDiJcrIFkq4UKeJVg==",
        "dependencies": { "ms": "ms@2.1.2" }
      },
      "ms@2.1.2": {
        "integrity": "sha512-sGkPx+VjMtmA6MX27oA4FBFELFCZZ4S4XqeGOXCv68tT+jb3vk/RyaKWP0PTKyWtmLSM0b+adUTEvbs1PEaH2w==",
        "dependencies": {}
      }
    }
  },
  "remote": {
    "https://deno.land/std@0.220.0/assert/assert.ts": "bec068b2fccdd434c138a555b19a2c2393b71dfaada02b7d568a01541e67cdc5",
    "https://deno.land/std@0.220.0/assert/assertion_error.ts": "9f689a101ee586c4ce92f52fa7ddd362e86434ffdf1f848e45987dc7689976b8"
  },
  "workspace": {
    "dependencies": [
      "jsr:@std/assert@^0.222.0",
      "npm:debug@^4.3.0"
    ]
  }
}`;

const groupBy = Object.groupBy;

describe("@molt/core", () => {
  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should update dependencies in `deno.jsonc`", async () => {
    await Deno.writeTextFile("deno.jsonc", DENO_JSONC);
    const refs = await collectFromImportMap("deno.jsonc");
    console.log(refs);

    const reqs = groupBy(
      refs,
      (ref) => stringify(ref.dependency, "kind", "name", "constraint"),
    );
    console.log(reqs);

    for (const [req, refs] of Object.entries(reqs)) {
      const dep = parse(req);
      const update = await getUpdate(dep);
      console.log(update);

      const updated = {
        ...dep,
        // constraint: increase(dep.constraint, update.released),
      };

      assertExists(refs);
      for (const ref of refs) {
        // rewrite(ref.source, updated);
      }

      // commit(refs)
      
    }
  });
});
