import * as fs from "@chiezo/amber/fs";
import { assertEquals, assertObjectMatch, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  collectUpdateFromLockFile,
  createLockPart,
  createLockPartForEach,
  extractLockPart,
  parseLockFileJson,
  readLockFile,
  writeToLockfile,
} from "./lockfile.ts";
import { associateByFile, type FileUpdate } from "./file.ts";
import { collect } from "./update.ts";

Deno.test("parseLockFileJson", async () =>
  assertObjectMatch(
    parseLockFileJson(
      await Deno.readTextFile(
        new URL("../test/fixtures/lockfile/deno.updated.lock", import.meta.url),
      ),
    ),
    {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@core/match@0.1.x": "jsr:@core/match@0.1.9",
          "npm:hono@^3": "npm:hono@3.12.12",
          "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0",
        },
      },
    },
  ));

describe("createLockPart", () => {
  it("should create an updated partial lock for a package", async () => {
    const lock = await createLockPart("jsr:@core/match@0.1.x");
    assertObjectMatch(
      lock.data,
      {
        packages: {
          specifiers: {
            "jsr:@core/match@0.1.x": "jsr:@core/match@0.1.9",
            "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0",
          },
        },
      },
    );
  });
});

describe.only("extractLockPart", () => {
  it("should extract a partial lock for a package from a lock file", async () => {
    const lock = await extractLockPart(
      "jsr:@std/assert@^0.222.0",
      await readLockFile(
        new URL("../test/fixtures/deno.lock", import.meta.url),
      ),
    );
    //assertObjectMatch(lock.data, {
    //  packages: {
    //    specifiers: {
    //      "jsr:@std/assert@^0.222.0": "jsr:@std/assert@0.222.0",
    //      "jsr:@std/fmt@^0.222.0": "jsr:@std/fmt@0.222.0",
    //    },
    //    jsr: {
    //      "@std/assert@0.222.0": {
    //        "integrity":
    //          "cbf00c0d8125a56c087e3d1ea0e638760d47206b30e9d300bad826b811719fc7",
    //        "dependencies": [
    //          "jsr:@std/fmt@^0.222.0",
    //        ],
    //      },
    //      "@std/fmt@0.222.0": {
    //        "integrity": "0eb99babf1cc697d67e76e8753916c037bbc3ce4abcefa321e1465708b0adda1"
    //      },
    //    },
    //  },
    //});
  });

  it("should extract a fixed partial lock for an entrypoint from a lock file", async () => {
    const lock = await extractLockPart(
      "jsr:@std/testing@^0.222.0/bdd",
      await readLockFile(
        new URL("../test/fixtures/deno.lock", import.meta.url),
      ),
    );
  });
});

Deno.test("createLockPart - jsr:@std/testing/bdd", async () => {
  const lock = await createLockPart("jsr:@std/testing@^0.222.0/bdd");
  assertEquals(lock.specifier, "jsr:@std/testing@^0.222.0/bdd");
  assertObjectMatch(
    lock.data,
    {
      packages: {
        specifiers: {
          "jsr:@std/testing@^0.222.0": "jsr:@std/testing@0.222.1",
        },
      },
    },
  );
});

Deno.test("createLockPart - jsr:@std/testing/bdd - locked", async () => {
  const lock = await createLockPart(
    "jsr:@std/testing@^0.222.0/bdd",
    await readLockFile(new URL("../test/fixtures/deno.lock", import.meta.url)),
  );
  assertEquals(lock.specifier, "jsr:@std/testing@^0.222.0/bdd");
  assertObjectMatch(
    lock.data,
    {
      packages: {
        specifiers: {
          "jsr:@std/testing@^0.222.0": "jsr:@std/testing@0.222.0",
        },
      },
    },
  );
});

Deno.test("createLockPart - jsr:@std/testing", async () => {
  await assertRejects(() => createLockPart("jsr:@std/testing@^0.222.0"));
});

Deno.test("createLockPart - npm:hono", async () => {
  const lock = await createLockPart("npm:hono@^3");
  assertObjectMatch(
    lock.data,
    {
      packages: {
        specifiers: {
          "npm:hono@^3": "npm:hono@3.12.12",
        },
      },
    },
  );
});

Deno.test("createLockPart - http", async () => {
  const lock = await createLockPart(
    "https://deno.land/x/deno_graph@0.50.0/mod.ts",
  );
  assertObjectMatch(
    lock.data,
    {
      remote: {
        "https://deno.land/x/deno_graph@0.50.0/deno_graph_wasm.generated.js":
          "e1d58f79f4e33c7cc1062af565600f422a2fec1b5eaee42691f2a7992d9d5e6b",
        "https://deno.land/x/deno_graph@0.50.0/loader.ts":
          "a2e757383908f4a51659fe1b1203386887ebb17756bac930a64856d613d8d57d",
        "https://deno.land/x/deno_graph@0.50.0/media_type.ts":
          "a89a1b38d07c160e896de9ceb99285ba8391940140558304171066b5c3ef7609",
        "https://deno.land/x/deno_graph@0.50.0/mod.ts":
          "47b5e8560f3e66468194742239fc76cf587d611dd43c1913eeebb9b1d94fc39f",
        "https://deno.land/x/dir@1.5.1/data_local_dir/mod.ts":
          "91eb1c4bfadfbeda30171007bac6d85aadacd43224a5ed721bbe56bc64e9eb66",
        "https://deno.land/x/wasmbuild@0.14.1/cache.ts":
          "89eea5f3ce6035a1164b3e655c95f21300498920575ade23161421f5b01967f4",
        "https://deno.land/x/wasmbuild@0.14.1/loader.ts":
          "d98d195a715f823151cbc8baa3f32127337628379a02d9eb2a3c5902dbccfc02",
      },
    },
  );
});

Deno.test("createLockPartForEach", async () => {
  const updated = await createLockPartForEach(
    await readLockFile(
      new URL("../test/fixtures/lockfile/deno.lock", import.meta.url),
    ),
  );
  assertEquals(updated.length, 3);
  assertObjectMatch(
    updated[0].data,
    {
      packages: {
        specifiers: {
          "jsr:@core/match@0.1.x": "jsr:@core/match@0.1.9",
          "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0",
        },
      },
    },
  );
  assertObjectMatch(
    updated[1].data,
    {
      packages: {
        specifiers: {
          "npm:hono@^3": "npm:hono@3.12.12",
        },
      },
    },
  );
  assertObjectMatch(
    updated[2].data,
    {
      packages: {
        specifiers: {
          "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0",
        },
      },
    },
  );
});

Deno.test("createLockPartForEach - no updates", async () => {
  const updated = await createLockPartForEach(
    await readLockFile(
      new URL("../test/fixtures/lockfile/deno.lock", import.meta.url),
    ),
    false,
  );
  assertEquals(updated.length, 3);
  assertObjectMatch(
    updated[0].data,
    {
      version: "3",
      packages: {
        specifiers: {
          "jsr:@core/match@0.1.0": "jsr:@core/match@0.1.0",
          "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0",
        },
        jsr: { "@core/match@0.1.0": {/* won't check */} },
        npm: { "ts-toolbelt@9.6.0": {/* won't check */} },
      },
    },
  );
  assertObjectMatch(
    updated[1].data,
    {
      version: "3",
      packages: {
        specifiers: { "npm:hono@3.0.0": "npm:hono@3.0.0" },
        npm: { "hono@3.0.0": {/* won't check */} },
      },
      remote: {},
    },
  );
  assertObjectMatch(
    updated[2].data,
    {
      version: "3",
      packages: {
        specifiers: { "npm:ts-toolbelt@9.6.0": "npm:ts-toolbelt@9.6.0" },
        npm: {
          "ts-toolbelt@9.6.0": {/* won't check */},
        },
      },
      remote: {},
    },
  );
});

Deno.test("collectUpdateFromLockFile", async () => {
  const updates = await collectUpdateFromLockFile(
    await readLockFile(
      new URL("../test/fixtures/lockfile/deno.lock", import.meta.url),
    ),
  );
  assertEquals(updates.length, 2);
  assertObjectMatch(
    updates[0],
    {
      from: {
        protocol: "jsr:",
        name: "@core/match",
        version: "0.1.0",
        path: "",
      },
      to: {
        protocol: "jsr:",
        name: "@core/match",
        version: "0.1.9",
        path: "",
      },
      code: { specifier: "jsr:@core/match@0.1.x", span: undefined },
      map: undefined,
    },
  );
  assertObjectMatch(
    updates[1],
    {
      from: {
        protocol: "npm:",
        name: "hono",
        version: "3.0.0",
        path: "",
      },
      to: {
        protocol: "npm:",
        name: "hono",
        version: "3.12.12",
        path: "",
      },
      code: { specifier: "npm:hono@^3", span: undefined },
      map: undefined,
    },
  );
});

Deno.test("collectUpdateFromLockFile - with a patch", async () => {
  const updates = await collectUpdateFromLockFile(
    await readLockFile(
      new URL("../test/fixtures/lockfile/deno.lock", import.meta.url),
    ),
    "npm:hono@^3",
  );
  assertEquals(updates.length, 1);
  assertObjectMatch(
    updates[0],
    {
      from: {
        protocol: "npm:",
        name: "hono",
        version: "3.0.0",
        path: "",
      },
      to: {
        protocol: "npm:",
        name: "hono",
        version: "3.12.12",
        path: "",
      },
      code: { specifier: "npm:hono@^3", span: undefined },
      map: undefined,
    },
  );
});

Deno.test("collectUpdateFromLockFile - extended mapping", async () => {
  const updates = await collectUpdateFromLockFile(
    await readLockFile(
      new URL("../test/fixtures/deno.lock", import.meta.url),
    ),
    "jsr:/@std/testing@^0.222.0/bdd",
  );
  assertEquals(updates.length, 1);
  assertObjectMatch(
    updates[0],
    {
      from: {
        protocol: "jsr:",
        name: "@std/testing",
        version: "0.222.0",
        path: "",
      },
      to: {
        protocol: "jsr:",
        name: "@std/testing",
        version: "0.222.1",
        path: "",
      },
      code: { specifier: "jsr:/@std/testing@^0.222.0/bdd", span: undefined },
    },
  );
});

Deno.test("writeToLockFile", async () => {
  const source = new URL("../test/fixtures/lockfile/mod.ts", import.meta.url);
  const lockFile = new URL(
    "../test/fixtures/lockfile/deno.lock",
    import.meta.url,
  );
  const result = await collect(source, {
    importMap: new URL("deno.json", source),
    lock: true,
    lockFile,
  });
  const files = associateByFile(result).filter((file) =>
    file.kind === "lockfile"
  ) as FileUpdate<"lockfile">[];

  fs.stub(new URL("../test/fixtures/lockfile", import.meta.url));
  const actual = await fs.use(async () => {
    for (const file of files) {
      await writeToLockfile(file);
    }
    return parseLockFileJson(await Deno.readTextFile(lockFile));
  });
  const expected = parseLockFileJson(
    await Deno.readTextFile(
      new URL("../test/fixtures/lockfile/deno.updated.lock", import.meta.url),
    ),
  );
  // deno-lint-ignore no-explicit-any
  assertObjectMatch(actual, expected as any);
});

Deno.test("writeToLockFile", async () => {
  const source = new URL("../test/fixtures/mod_test.ts", import.meta.url);
  const lockFile = new URL("deno.lock", source);
  const result = await collect(source, {
    importMap: new URL("deno.jsonc", source),
    lock: true,
    lockFile,
  });
  console.log(result.locks);
  const files = associateByFile(result).filter((file) =>
    file.kind === "lockfile"
  ) as FileUpdate<"lockfile">[];
  fs.stub(new URL("../test/fixtures", import.meta.url));
  const actual = await fs.use(async () => {
    for (const file of files) {
      await writeToLockfile(file);
    }
    return parseLockFileJson(await Deno.readTextFile(lockFile));
  });
});
