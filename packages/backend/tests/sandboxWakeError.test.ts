import { describe, expect, test } from "bun:test";
import { toUserFacingSandboxError } from "../convex/_sessions/sandbox";

const MAX_LENGTH = 200;

describe("toUserFacingSandboxError", () => {
  test("keeps the first line and drops the stack under it", () => {
    expect(
      toUserFacingSandboxError(
        "Uncaught Error: Sandbox quota exceeded\n    at startSandbox (../convex/_sessions/sandbox.ts:104:11)\n    at async handler",
      ),
    ).toBe("Sandbox quota exceeded");
  });

  test("strips the Convex envelope and request id", () => {
    expect(
      toUserFacingSandboxError(
        "[CONVEX A(sandbox:startSandbox)] [Request ID: 9f3a2c] Repository not found",
      ),
    ).toBe("Repository not found");
  });

  test("passes a message that was already readable through unchanged", () => {
    expect(
      toUserFacingSandboxError("The dev server exited before it was ready."),
    ).toBe("The dev server exited before it was ready.");
  });

  test("falls back to a sentence when nothing readable is left", () => {
    expect(toUserFacingSandboxError("")).toBe("The sandbox did not start.");
    expect(
      toUserFacingSandboxError("[CONVEX A(sandbox:startSandbox)]\n   at run"),
    ).toBe("The sandbox did not start.");
  });

  test("truncates to the one-line budget and marks the cut", () => {
    const cleaned = toUserFacingSandboxError(`npm error ${"x".repeat(500)}`);
    expect(cleaned.length).toBe(MAX_LENGTH);
    expect(cleaned.endsWith("…")).toBe(true);
  });

  test("never returns a newline, whatever it was given", () => {
    const cleaned = toUserFacingSandboxError(
      "Error: setup failed\nline two\nline three",
    );
    expect(cleaned).not.toContain("\n");
  });
});
