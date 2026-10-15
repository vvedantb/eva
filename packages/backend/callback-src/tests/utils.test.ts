import { describe, expect, it } from "vitest";
import {
  isJsonObject,
  readStringField,
  readTrimmedString,
  tryParseJsonObject,
  unwrapConvexMutationPayload,
} from "../utils.js";

describe("isJsonObject", () => {
  it("accepts plain objects only", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
    expect(isJsonObject("x")).toBe(false);
    expect(isJsonObject(0)).toBe(false);
  });
});

describe("tryParseJsonObject", () => {
  it("returns the parsed object", () => {
    expect(tryParseJsonObject('{"type":"result"}')).toEqual({ type: "result" });
  });

  it("rejects arrays, primitives and malformed input", () => {
    expect(tryParseJsonObject("[1,2]")).toBeNull();
    expect(tryParseJsonObject('"text"')).toBeNull();
    expect(tryParseJsonObject("42")).toBeNull();
    expect(tryParseJsonObject("null")).toBeNull();
    expect(tryParseJsonObject("{not json")).toBeNull();
    expect(tryParseJsonObject("")).toBeNull();
  });
});

describe("readTrimmedString", () => {
  it("returns trimmed non-blank strings", () => {
    expect(readTrimmedString("  id-1 ")).toBe("id-1");
  });

  it("returns undefined for blank strings and non-strings", () => {
    expect(readTrimmedString("   ")).toBeUndefined();
    expect(readTrimmedString("")).toBeUndefined();
    expect(readTrimmedString(undefined)).toBeUndefined();
    expect(readTrimmedString(3)).toBeUndefined();
    expect(readTrimmedString({ id: "x" })).toBeUndefined();
  });
});

describe("readStringField", () => {
  it("follows key order", () => {
    expect(readStringField({ a: "first", b: "second" }, ["b", "a"])).toBe(
      "second",
    );
  });

  it("skips blank and non-string values", () => {
    expect(readStringField({ a: "  ", b: 1, c: "hit" }, ["a", "b", "c"])).toBe(
      "hit",
    );
    expect(readStringField({ a: "" }, ["a", "missing"])).toBe("");
  });

  it("returns the raw untrimmed value", () => {
    expect(readStringField({ text: "  line\n" }, ["text"])).toBe("  line\n");
  });
});

describe("unwrapConvexMutationPayload", () => {
  it("unwraps Convex mutation envelopes and bare objects", () => {
    expect(unwrapConvexMutationPayload({ value: { answer: "yes" } })).toEqual({
      answer: "yes",
    });
    expect(unwrapConvexMutationPayload({ answer: "yes" })).toEqual({
      answer: "yes",
    });
    expect(unwrapConvexMutationPayload(null)).toBeNull();
    expect(unwrapConvexMutationPayload([])).toBeNull();
  });
});
