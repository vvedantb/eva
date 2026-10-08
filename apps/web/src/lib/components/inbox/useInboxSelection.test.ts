import { describe, expect, test } from "vitest";
import { rangeBetween } from "./useInboxSelection";

const ids = ["a", "b", "c", "d"];

describe("rangeBetween", () => {
  test("covers both ends of a forward range", () => {
    expect(rangeBetween(ids, "b", "d")).toEqual(["b", "c", "d"]);
  });

  test("reads the same backwards", () => {
    expect(rangeBetween(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  test("a range of one is the row itself", () => {
    expect(rangeBetween(ids, "c", "c")).toEqual(["c"]);
  });

  test("an anchor that left the list selects only the target", () => {
    expect(rangeBetween(ids, "gone", "c")).toEqual(["c"]);
  });
});
