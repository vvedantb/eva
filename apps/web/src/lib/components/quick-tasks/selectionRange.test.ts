import { describe, expect, it } from "vitest";
import { rangeBetween } from "./selectionRange";

const ids = ["a", "b", "c", "d", "e"];

describe("rangeBetween", () => {
  it("spans forwards when the anchor comes before the target", () => {
    expect(rangeBetween(ids, "b", "d")).toEqual(["b", "c", "d"]);
  });

  it("spans backwards when the anchor comes after the target", () => {
    expect(rangeBetween(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("returns only the target when there is no anchor", () => {
    expect(rangeBetween(ids, null, "c")).toEqual(["c"]);
  });

  it("returns only the target when the anchor is no longer in the list", () => {
    expect(rangeBetween(ids, "z", "c")).toEqual(["c"]);
  });

  it("returns only the target when the target is not in the list", () => {
    expect(rangeBetween(ids, "b", "z")).toEqual(["z"]);
  });

  it("returns a single item when the anchor is the target", () => {
    expect(rangeBetween(ids, "c", "c")).toEqual(["c"]);
  });

  it("handles a single-item list", () => {
    expect(rangeBetween(["only"], "only", "only")).toEqual(["only"]);
  });

  it("returns the target when the list is empty", () => {
    expect(rangeBetween([], "a", "b")).toEqual(["b"]);
  });
});
