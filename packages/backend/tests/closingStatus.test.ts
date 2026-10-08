import { describe, expect, test } from "vitest";
import { isSandboxClosingStatus } from "../convex/_sandbox/closingStatus";

describe("isSandboxClosingStatus", () => {
  test("matches closed and stopping only", () => {
    expect(isSandboxClosingStatus("closed")).toBe(true);
    expect(isSandboxClosingStatus("stopping")).toBe(true);
    expect(isSandboxClosingStatus("active")).toBe(false);
    expect(isSandboxClosingStatus("starting")).toBe(false);
    expect(isSandboxClosingStatus(undefined)).toBe(false);
  });
});
