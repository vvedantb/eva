import { expect, test } from "vitest";
import {
  isValidSandboxViewerPath,
  isValidSandboxWritePath,
} from "../convex/_sandbox_runtime/services";

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

test("file viewer paths stay inside the workspace and off secrets", () => {
  expect(isValidSandboxViewerPath("/tmp/repo/src/a.ts")).toBe(true);
  expect(isValidSandboxViewerPath("/workspace/repo/src/a.ts")).toBe(true);
  expect(isValidSandboxViewerPath("/tmp/workspace/linked/src/a.ts")).toBe(true);

  expect(
    isValidSandboxViewerPath("/home/eva/.config/eva/git-credentials.env"),
  ).toBe(false);
  expect(isValidSandboxViewerPath("/vercel/sandbox/.eva-env.sh")).toBe(false);
  expect(isValidSandboxViewerPath("/tmp/repo/.eva-env.sh")).toBe(false);
  expect(isValidSandboxViewerPath("/tmp/repo/a/git-credentials.env")).toBe(
    false,
  );
  expect(isValidSandboxViewerPath("/tmp/repo/.git/config")).toBe(false);
  expect(isValidSandboxViewerPath("/tmp/repo/../../etc/passwd")).toBe(false);
  expect(isValidSandboxViewerPath("/tmp/repository/a.ts")).toBe(false);
  expect(isValidSandboxViewerPath("/tmp/repo")).toBe(false);
});
