import * as fs from "@chiezo/amber/fs";
import { assertEquals, assertObjectMatch } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  createLock,
  extract,
  type Lockfile,
  readLockfile,
} from "./lockfile.ts";
import { parse } from "./deps.ts";

const LOCKFILE: string = `{
  "version": "3",
  "packages": {
    "specifiers": {
      "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.222.0",
      "jsr:@std/fmt@^0.222.0": "jsr:@std/fmt@0.222.0",
      "jsr:@std/testing@^0.222.0": "jsr:@std/testing@0.222.0"
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
      "@std/testing@0.222.0": {
        "integrity": "a6d10c9fbb1df052ad7f73174d511328c08b7408bdd162ef6c3bc04def49c2ae"
      }
    }
  },
  "remote": {
    "https://deno.land/x/deno_graph@0.50.0/deno_graph_wasm.generated.js": "e1d58f79f4e33c7cc1062af565600f422a2fec1b5eaee42691f2a7992d9d5e6b",
    "https://deno.land/x/deno_graph@0.50.0/loader.ts": "a2e757383908f4a51659fe1b1203386887ebb17756bac930a64856d613d8d57d",
    "https://deno.land/x/deno_graph@0.50.0/media_type.ts": "a89a1b38d07c160e896de9ceb99285ba8391940140558304171066b5c3ef7609",
    "https://deno.land/x/deno_graph@0.50.0/mod.ts": "47b5e8560f3e66468194742239fc76cf587d611dd43c1913eeebb9b1d94fc39f",
    "https://deno.land/x/dir@1.5.1/data_local_dir/mod.ts": "91eb1c4bfadfbeda30171007bac6d85aadacd43224a5ed721bbe56bc64e9eb66",
    "https://deno.land/x/wasmbuild@0.14.1/cache.ts": "89eea5f3ce6035a1164b3e655c95f21300498920575ade23161421f5b01967f4",
    "https://deno.land/x/wasmbuild@0.14.1/loader.ts": "d98d195a715f823151cbc8baa3f32127337628379a02d9eb2a3c5902dbccfc02"
  },
  "workspace": {
    "dependencies": [
      "jsr:@std/assert@^0.222.0",
      "jsr:@std/testing@^0.222.0"
    ]
  }
}`;

describe("readLockfile", () => {
  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should read a lockfile", async () => {
    await Deno.writeTextFile("deno.lock", LOCKFILE);
    const lockfile = await readLockfile("deno.lock");
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

describe("extract", () => {
  let lockfile: Lockfile;

  beforeEach(async () => {
    fs.mock();
    await Deno.writeTextFile("deno.lock", LOCKFILE);
    lockfile = await readLockfile("deno.lock");
  });
  afterEach(() => fs.dispose());

  it("should extract the partial lock for a package from a lockfile", async () => {
    const dep = parse("jsr:@std/testing@^0.222.0");
    const part = await extract(dep, lockfile);
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

  it("should extract the partial lock along with the dependencies", async () => {
    const dep = parse("jsr:@std/assert@^0.222.0");
    const part = await extract(dep, lockfile);
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

  it("should extract the remote dependencies", async () => {
    const dep = parse("https://deno.land/x/deno_graph@0.50.0/mod.ts");
    const actual = await extract(dep, lockfile);
    assertEquals(actual, {
      version: "3",
      remote: lockfile.toJson().remote,
    });
  });
});

describe.only("createLock - package", () => {
  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should create a new partial lock for a package updated", async () => {
    const update = await createLock(
      parse("jsr:@std/assert@^0.222.0"),
      "0.222.1",
    );
    assertEquals(update, {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.222.1",
          "jsr:@std/fmt@^0.222.1": "jsr:@std/fmt@0.222.1",
        },
        jsr: {
          "@std/assert@0.222.1": {
            "integrity":
              "691637161ee584a9919d1f9950ddd1272feb8e0a19e83aa5b7563cedaf73d74c",
            "dependencies": [
              "jsr:@std/fmt@^0.222.1",
            ],
          },
          "@std/fmt@0.222.1": {
            "integrity":
              "ec3382f9b0261c1ab1a5c804aa355d816515fa984cdd827ed32edfb187c0a722",
          },
        },
      },
      remote: {},
      workspace: { dependencies: ["jsr:@std/assert@^0.222.0"] },
    });
  });

  it("should create a new partial lock for a package updated", async () => {
    const part = await createLock(
      parse("jsr:@std/assert@^0.226.0"),
      "0.226.0",
    );
    assertEquals(part, {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.226.0",
          "jsr:@std/internal@^1.0.0": "jsr:@std/internal@1.0.0",
        },
        jsr: {
          "@std/assert@0.226.0": {
            integrity:
              "0dfb5f7c7723c18cec118e080fec76ce15b4c31154b15ad2bd74822603ef75b3",
            dependencies: ["jsr:@std/internal@^1.0.0"],
          },
          "@std/internal@1.0.0": {
            integrity:
              "ac6a6dfebf838582c4b4f61a6907374e27e05bedb6ce276e0f1608fe84e7cd9a",
          },
        },
      },
      remote: {},
      workspace: { dependencies: ["jsr:@std/assert@^0.222.0"] },
    });
  });
});
