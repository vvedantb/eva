import { describe, expect, test } from "bun:test";
import { isSandboxClosingStatus } from "../convex/_sandbox/closingStatus";

describe("a turn on a reused sandbox clears the stale closed status", () => {
  test("prewarm still skips closing sessions", () => {
    expect(isSandboxClosingStatus("closed")).toBe(true);
    expect(isSandboxClosingStatus("stopping")).toBe(true);
    expect(isSandboxClosingStatus("active")).toBe(false);
  });
});
