import { describe, expect, test } from "bun:test";
import { errorMessage } from "../convex/_sandbox_runtime/helpers";

describe("errorMessage", () => {
  test("prefers a non-empty message", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  test("falls back for a non-Error", () => {
    expect(errorMessage("boom", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
    expect(errorMessage({ message: "boom" }, "fallback")).toBe("fallback");
  });

  test("treats a whitespace-only message as empty", () => {
    expect(errorMessage(new Error("   "), "fallback")).toBe("fallback");
  });

  test("names the error type when the message is empty", () => {
    expect(errorMessage(new TypeError(""), "fallback")).toBe("TypeError");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
  });

  test("unpacks an AggregateError's inner messages", () => {
    const aggregate = new AggregateError(
      [new Error("ECONNREFUSED"), new Error("ETIMEDOUT")],
      "",
    );
    expect(errorMessage(aggregate, "fallback")).toBe(
      "AggregateError: ECONNREFUSED; ETIMEDOUT",
    );
  });

  test("falls back to an inner error's name when it too has no message", () => {
    const aggregate = new AggregateError([new TypeError("")], "");
    expect(errorMessage(aggregate, "fallback")).toBe(
      "AggregateError: TypeError",
    );
  });

  test("keeps the fallback when an AggregateError is empty", () => {
    expect(errorMessage(new AggregateError([], ""), "fallback")).toBe(
      "AggregateError",
    );
  });

  test("appends a cause", () => {
    const error = new Error("", { cause: new Error("socket hang up") });
    expect(errorMessage(error, "fallback")).toBe("cause: socket hang up");
  });

  test("stringifies a non-Error cause", () => {
    expect(errorMessage(new Error("", { cause: 502 }), "fallback")).toBe(
      "cause: 502",
    );
  });

  test("joins every recovered part", () => {
    const aggregate = new AggregateError([new Error("ECONNREFUSED")], "", {
      cause: new Error("dns"),
    });
    expect(errorMessage(aggregate, "fallback")).toBe(
      "AggregateError: ECONNREFUSED: cause: dns",
    );
  });
});
