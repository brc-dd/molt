import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { getUpdate } from "./updates.ts";
import { parse } from "./deps.ts";

describe("getUpdate", () => {
  it("should return the update to a remote dependency", async () => {
    const dep = parse("https://deno.land/std@0.220.0/bytes/copy.ts");
    const actual = await getUpdate(dep);
    assertEquals(actual, {
      latest: "0.224.0",
      released: "0.224.0",
    });
  });
});
