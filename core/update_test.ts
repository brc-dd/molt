import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { getUpdate } from "./update.ts";
import { parse } from "./dependency.ts";

describe("getLatestVersion", () => {
  it("should return the latest version of a JSR dependency", async () => {
    const dep = parse("jsr:@std/assert@^0.222.0");
    const actual = await getUpdate(dep);
    assertEquals(actual, "0.222.2");
  });
});
