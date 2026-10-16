import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

/** Source from `marker` up to the next top-level `export`. */
function exportBody(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `missing ${marker}`).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

const lifecycle = convexSource("_sandbox_runtime/lifecycle.ts");
const execution = convexSource("_sandbox_runtime/execution.ts");
const linkedRepos = convexSource("_sandbox_runtime/linkedRepos.ts");
const prDescription = convexSource("_github/prDescription.ts");

/**
 * The Vercel SDK resumes a stopped sandbox on any exec. A background job that
 * runs after Stop therefore wakes the VM while the owner row says `closed`, and
 * it billed for hours (Oct 2026: session #115, project #3, PR descriptions).
 * Each job below must check before its first exec.
 */
describe("background jobs never resurrect a stopped sandbox", () => {
  test.each([
    [lifecycle, "export const killSandboxProcess"],
    [lifecycle, "export const captureDiagnosticsAndStopSandbox"],
    [execution, "export const killEntityDaemon"],
    [execution, "export const extendSandboxDeadline"],
  ])("%#: best-effort job only touches a running VM", (source, marker) => {
    const body = exportBody(source, marker);
    expect(body).toContain("getRunningSandboxHandle(");
    expect(body).not.toContain("getSandboxHandle(");
  });

  test.each([
    [linkedRepos, "export const prepareLinkedRepo"],
    [execution, "export const watchConvexReadiness"],
    [prDescription, "export const generatePrDescription"],
  ])("%#: checks the owner still wants the VM before exec", (source, marker) => {
    const body = exportBody(source, marker);
    const guardAt = body.indexOf("sandboxStillWanted(");
    const handleAt = body.indexOf("getSandboxHandle(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(handleAt);
  });
});
