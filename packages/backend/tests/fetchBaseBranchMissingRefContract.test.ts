import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

function readSource(relativePath: string): string {
  return readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

const git = readSource("_sandbox_runtime/git.ts");
const execution = readSource("_sandbox_runtime/execution.ts");

/**
 * fetchBaseBranch used to rethrow git exit 128, so Convex recorded
 * function_execution status=failure and worker:runActionWrapper logged ERROR
 * for deleted eva/automation-* refs. Missing refs must complete as a handled
 * result so callers can fall back to local snapshot refs.
 */
describe("fetchOrigin treats a missing remote ref as fetched=false", () => {
  const body = functionBody(git, "export async function fetchOrigin(");

  test("catches the missing-ref helper inside the logged fetch step", () => {
    expect(body).toContain("isMissingRemoteRefFetchFailure(error)");
    expect(body).toContain("return { fetched: false }");
    expect(body).toContain("return { fetched: true }");
  });

  test("still rethrows other git failures", () => {
    expect(body).toContain("throw error");
  });
});

describe("fetchBaseBranch does not fail the Convex action on a missing ref", () => {
  const body = functionBody(execution, "export const fetchBaseBranch =");

  test("reads fetchOrigin's handled result instead of letting it throw", () => {
    expect(body).toContain("const result = await fetchOrigin(");
    expect(body).toContain("if (!result.fetched)");
    expect(body).toContain("return null");
  });

  test("does not rethrow after a missing remote ref", () => {
    expect(body).not.toMatch(/throw\s/);
  });
});
