import { describe, expect, it } from "vitest";
import { readStringField, tryParseJsonObject } from "../utils.js";

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
