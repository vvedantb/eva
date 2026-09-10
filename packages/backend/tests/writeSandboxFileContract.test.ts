import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { isValidSandboxWritePath } from "../convex/_sandbox_runtime/services";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative: string): string {
  return readFileSync(join(backendDir, relative), "utf8");
}

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

test("writeSandboxFile rejects oversized content before touching the sandbox", () => {
  const services = read("convex/_sandbox_runtime/services.ts");
  const action = services.slice(
    services.indexOf("export const writeSandboxFile"),
  );
  const handler = action.slice(0, action.indexOf("\n});"));

  // The cap is the viewer's read cap, so a truncated read can never be saved back.
  expect(handler).toContain("MAX_FILE_VIEWER_BYTES");
  expect(handler).toContain('status: "too_large" as const');

  const capIndex = handler.indexOf("size > MAX_FILE_VIEWER_BYTES");
  const authIndex = handler.indexOf("authorizedRunningHandle(");
  expect(capIndex).toBeGreaterThan(-1);
  expect(authIndex).toBeGreaterThan(-1);
  expect(
    capIndex,
    "the size cap must be checked before the sandbox handle is resolved",
  ).toBeLessThan(authIndex);
});

test("writeSandboxFile never interpolates content into a shell command", () => {
  const services = read("convex/_sandbox_runtime/services.ts");
  const action = services.slice(
    services.indexOf("export const writeSandboxFile"),
  );
  const handler = action.slice(0, action.indexOf("\n});"));

  expect(handler).toContain(
    "writeFileToSandbox(handle, args.path, args.content)",
  );
  expect(handler).not.toContain("execHandle(");
});

test("sandbox.ts re-exports writeSandboxFile", () => {
  expect(read("convex/sandbox.ts")).toContain("writeSandboxFile");
});
