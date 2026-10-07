import { describe, expect, test } from "vitest";
import { mergeSessionTabOrder } from "./sessionTabOrder";

type Row = { _id: string };

const a: Row = { _id: "a" };
const b: Row = { _id: "b" };
const c: Row = { _id: "c" };

describe("mergeSessionTabOrder", () => {
  test("keeps the caller's order when nothing was dragged", () => {
    expect(mergeSessionTabOrder([a, b, c], [])).toEqual([a, b, c]);
  });

  test("places saved ids first, in the order they were dropped", () => {
    expect(mergeSessionTabOrder([a, b, c], ["c", "a"])).toEqual([c, a, b]);
  });

  test("appends sessions the saved order has never seen", () => {
    expect(mergeSessionTabOrder([a, b, c], ["b"])).toEqual([b, a, c]);
  });

  test("ignores saved ids whose session is gone", () => {
    expect(mergeSessionTabOrder([a, b], ["gone", "b", "a"])).toEqual([b, a]);
  });

  test("never lists a session twice for a duplicated saved id", () => {
    expect(mergeSessionTabOrder([a, b], ["a", "a", "b"])).toEqual([a, b]);
  });
});
