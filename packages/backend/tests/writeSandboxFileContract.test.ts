import { expect, test } from "vitest";
import { isValidSandboxWritePath } from "../convex/_sandbox_runtime/services";

test("write paths must be absolute, clean and file-shaped", () => {
  expect(isValidSandboxWritePath("/vercel/sandbox/repo/src/a.ts")).toBe(true);
  expect(isValidSandboxWritePath("/tmp/repo/docs/eva-ui.md")).toBe(true);
  // A file literally named "..something" is fine — only a `..` segment is not.
  expect(isValidSandboxWritePath("/tmp/repo/..hidden")).toBe(true);

  expect(isValidSandboxWritePath("src/a.ts")).toBe(false);
  expect(isValidSandboxWritePath("./src/a.ts")).toBe(false);
  expect(isValidSandboxWritePath("")).toBe(false);
  expect(
    isValidSandboxWritePath(`/tmp/repo/a${String.fromCharCode(0)}.ts`),
  ).toBe(false);
  expect(isValidSandboxWritePath("/tmp/repo/src/")).toBe(false);
  expect(isValidSandboxWritePath("/tmp/repo/../../etc/passwd")).toBe(false);
  expect(isValidSandboxWritePath("/../etc/passwd")).toBe(false);
  expect(isValidSandboxWritePath("/tmp/repo/..")).toBe(false);
});
