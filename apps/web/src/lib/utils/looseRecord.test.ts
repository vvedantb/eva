import { expect, test } from "vitest";
import { asRecord } from "./looseRecord";

test("asRecord returns the record for a plain object", () => {
  expect(asRecord({ a: 1 })).toEqual({ a: 1 });
});

test("asRecord returns null for non-records", () => {
  expect(asRecord(null)).toBeNull();
  expect(asRecord([1])).toBeNull();
  expect(asRecord("x")).toBeNull();
  expect(asRecord(42)).toBeNull();
});
