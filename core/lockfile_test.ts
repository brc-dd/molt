import { assertEquals, assertObjectMatch } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  extractPackage,
  extractRemote,
  type Lockfile,
  readLockfile,
} from "./lockfile.ts";

describe("readLockFile", () => {
  it("should read a lockfile", async () => {
    const lockfile = await readLockfile(
      new URL("../test/fixtures/deno.lock", import.meta.url),
    );
    assertObjectMatch(
      lockfile.toJson(),
      {
        version: "3",
        packages: {
          specifiers: {
            "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.222.0",
            "jsr:@std/fmt@^0.222.0": "jsr:@std/fmt@0.222.0",
            "jsr:@std/testing@^0.222.0": "jsr:@std/testing@0.222.0",
          },
        },
      },
    );
  });
});

describe("extractPackage", () => {
  let lockfile: Lockfile;

  beforeEach(async () => {
    lockfile = await readLockfile(
      new URL("../test/fixtures/deno.lock", import.meta.url),
    );
  });

  it("should extract the partial lock for a package from a lockfile", () => {
    const part = extractPackage("jsr:@std/testing@^0.222.0", lockfile);
    assertEquals(part, {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@std/testing@^0.222.0": "jsr:@std/testing@0.222.0",
        },
        jsr: {
          "@std/testing@0.222.0": {
            integrity:
              "a6d10c9fbb1df052ad7f73174d511328c08b7408bdd162ef6c3bc04def49c2ae",
          },
        },
      },
      remote: {},
      workspace: { dependencies: ["jsr:@std/testing@^0.222.0"] },
    });
  });

  it("should extract the partial lock along with the dependencies", () => {
    const part = extractPackage("jsr:@std/assert@^0.222.0", lockfile);
    assertEquals(part, {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.222.0",
          "jsr:@std/fmt@^0.222.0": "jsr:@std/fmt@0.222.0",
        },
        jsr: {
          "@std/assert@0.222.0": {
            "integrity":
              "cbf00c0d8125a56c087e3d1ea0e638760d47206b30e9d300bad826b811719fc7",
            "dependencies": [
              "jsr:@std/fmt@^0.222.0",
            ],
          },
          "@std/fmt@0.222.0": {
            "integrity":
              "0eb99babf1cc697d67e76e8753916c037bbc3ce4abcefa321e1465708b0adda1",
          },
        },
      },
      remote: {},
      workspace: { dependencies: ["jsr:@std/assert@^0.222.0"] },
    });
  });
});

describe("extractRemote", () => {
  it("should extract the remote dependencies", async () => {
    const lockfile = await readLockfile(
      new URL("../test/fixtures/deno.lock", import.meta.url),
    );
    const actual = await extractRemote(
      "https://deno.land/x/deno_graph@0.50.0/mod.ts",
      lockfile,
    );
    assertEquals(actual, {
      version: "3",
      remote: lockfile.toJson().remote,
    });
  });
});
