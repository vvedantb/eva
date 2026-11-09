import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const sessionsSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../convex/_sandbox_runtime/sessions.ts",
  ),
  "utf8",
);

/**
 * Session Preview Console launch must stay wired for task/project sandboxes.
 * Frontend auto-type alone races Vercel resume/early-ready (isNewPty false).
 */
test("preview sandbox prep launches the app server for every owner kind", () => {
  for (const step of [
    "reuseSessionSandbox.launchDevServer",
    "newSessionSandbox.launchDevServer",
  ]) {
    expect(sessionsSource).toContain(step);
  }
  expect(sessionsSource).toContain("launchPreviewDevServer(");

  // Task and project share one preview path: reuse closure + create path.
  const preview = functionBody(
    sessionsSource,
    "async function preparePreviewSandboxInternal(",
  );
  expect(preview.split("Sandbox.launchDevServer`").length - 1).toBe(2);
  expect(preview.split("launchPreviewDevServer(").length - 1).toBe(2);
});

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf("\n}", startAt);
  return source.slice(startAt, endAt < 0 ? undefined : endAt);
}
