import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const sessions = readSource("_sandbox_runtime/sessions.ts");
const devServer = readSource("_sandbox_runtime/devServer.ts");

const OWNERS = [
  {
    reuseStep: "tryReuseSessionSandbox",
    createStep: "createSessionSandboxAndPrepareRepo",
  },
  {
    reuseStep: "tryReuseTaskSandbox",
    createStep: "createTaskSandboxAndPrepareRepo",
  },
  {
    reuseStep: "tryReuseProjectSandbox",
    createStep: "createProjectSandboxAndPrepareRepo",
  },
] as const;

/**
 * Session 65 resumed a live VM, then dump restore failed with a Postgres
 * relation error. Reuse treated that as "sandbox gone" and created a second
 * box. These pins keep the three gates that stop that from happening again.
 */
describe("reuse does not mint a replacement for a live sandbox", () => {
  test.each(OWNERS)(
    "$createStep refuses a replacement while the old id is still alive",
    ({ reuseStep, createStep }) => {
      const window = sliceBetween(sessions, reuseStep, createStep);
      expect(
        window.includes("refuseReplacementIfStillAlive("),
        `${reuseStep} → ${createStep} lost the live-sandbox gate`,
      ).toBe(true);
    },
  );

  test("the live-sandbox gate probes classifyForReconcile", () => {
    const body = functionBody(
      sessions,
      "async function refuseReplacementIfStillAlive(",
    );
    expect(body).toContain("classifyForReconcile()");
    expect(body).toContain('classification !== "alive"');
    expect(body).toContain("refusing to replace live sandbox");
  });
});

describe("seeded dump restore does not wipe a populated public schema", () => {
  test("resume skips truncate when public already has tables", () => {
    const body = functionBody(
      devServer,
      "async function restoreSeededSupabaseDump(",
    );
    const skipAt = body.indexOf(
      "public schema already has tables; skipping seeded dump restore",
    );
    const truncateAt = body.indexOf("TRUNCATE TABLE");
    expect(skipAt, "the populated-schema skip moved").toBeGreaterThan(-1);
    expect(truncateAt, "the truncate moved").toBeGreaterThan(-1);
    expect(skipAt).toBeLessThan(truncateAt);
  });

  /**
   * carepulse-ts session 87: `supabase start` exited 127 inside the restore,
   * startSessionServices threw before resolving the dev command, and the
   * Preview Console never got a dev server on start or resume.
   */
  test("a failed dump restore never blocks the dev server launch", () => {
    const body = functionBody(
      devServer,
      "export async function restoreSeededRuntimeState(",
    );
    const tryAt = body.indexOf("try {\n    await restoreSeededSupabaseDump(");
    expect(tryAt, "the dump restore is no longer guarded").toBeGreaterThan(-1);
    expect(body.slice(tryAt)).toContain("} catch (error) {");
  });
});

function readSource(relativePath: string): string {
  return readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function sliceBetween(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  expect(startAt, `${start} moved`).toBeGreaterThan(-1);
  const endAt = source.indexOf(end, startAt);
  expect(endAt, `${end} moved`).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}
