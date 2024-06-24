import * as fs from "@chiezo/amber/fs";
import { assertEquals, assertObjectMatch } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { createLock, extract, readLockfile } from "./lockfile.ts";
import { parse } from "./deps.ts";

const LOCKFILE = `{
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
    "https://deno.land/std@0.220.0/assert/assert.ts": "bec068b2fccdd434c138a555b19a2c2393b71dfaada02b7d568a01541e67cdc5",
    "https://deno.land/std@0.220.0/assert/assertion_error.ts": "9f689a101ee586c4ce92f52fa7ddd362e86434ffdf1f848e45987dc7689976b8"
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
  const json = JSON.parse(LOCKFILE);

  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should extract the partial lock for a package from a lockfile", async () => {
    const dep = parse("jsr:@std/testing@^0.222.0");
    const part = await extract(dep, json);
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
    const part = await extract(dep, json);
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
    const dep = parse("https://deno.land/std@0.220.0/assert/assert.ts");
    const actual = await extract(dep, json);
    assertEquals(actual, {
      version: "3",
      remote: json.remote,
    });
  });
});

describe("createLock", () => {
  beforeEach(() => fs.mock());
  afterEach(() => fs.dispose());

  it("should create a partial lock for a package with a patch update", async () => {
    const lock = await createLock(
      parse("jsr:@std/assert@^0.222.0"),
      "0.222.1",
    );
    assertEquals(lock, {
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

  it("should create a partial lock for a package with a minor update", async () => {
    const lock = await createLock(
      parse("jsr:@std/assert@^0.226.0"),
      "0.226.0",
    );
    assertEquals(lock, {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@std/assert@^0.226.0": "jsr:@std/assert@0.226.0",
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
      workspace: { dependencies: ["jsr:@std/assert@^0.226.0"] },
    });
  });

  it("should create a partial lock for a remote dependency", async () => {
    const lock = await createLock(
      parse("https://deno.land/std@0.224.0/assert/assert.ts"),
      "0.224.0",
    );
    assertEquals(lock, {
      version: "3",
      remote: {
        "https://deno.land/std@0.224.0/assert/assert.ts":
          "09d30564c09de846855b7b071e62b5974b001bb72a4b797958fe0660e7849834",
        "https://deno.land/std@0.224.0/assert/assertion_error.ts":
          "ba8752bd27ebc51f723702fac2f54d3e94447598f54264a6653d6413738a8917",
      },
    });
  });
});
