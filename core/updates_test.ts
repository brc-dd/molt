import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { getUpdate } from "./updates.ts";
import { parse } from "./deps.ts";

describe("getUpdate", () => {
  it("should get an update to deno.land/std", async () => {
    const dep = parse("https://deno.land/std@0.220.0/bytes/copy.ts");
    const actual = await getUpdate(dep);
    assertEquals(actual, {
      constrainted: "0.220.0",
      latest: "0.224.0",
      released: "0.224.0",
    });
  });

  it("should get an update to deno.land/x/molt", async () => {
    const dep = parse("https://deno.land/x/molt@0.17.0/mod.ts");
    const actual = await getUpdate(dep);
    assertEquals(actual, {
      constrainted: "0.17.0",
      latest: "0.17.2",
      released: "0.17.2",
    });
  });
});
