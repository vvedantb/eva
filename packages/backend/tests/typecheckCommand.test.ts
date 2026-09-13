import { describe, expect, test } from "vitest";
import {
  buildTypecheckCommand,
  shellSingleQuote,
} from "../convex/_sandbox_runtime/typecheckCommand";

describe("shellSingleQuote", () => {
  test("wraps a plain path", () => {
    expect(shellSingleQuote("/tmp/repo")).toBe("'/tmp/repo'");
  });

  test("escapes embedded single quotes", () => {
    expect(shellSingleQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe("buildTypecheckCommand", () => {
  test("cds to the workspace root when no app directory is set", () => {
    expect(buildTypecheckCommand("")).toContain("cd '/tmp/repo' &&");
    expect(buildTypecheckCommand("")).toContain("npx tsc --noEmit");
  });

  test("scopes to the app root directory", () => {
    expect(buildTypecheckCommand("apps/web")).toContain(
      "cd '/tmp/repo/apps/web' &&",
    );
  });
});
