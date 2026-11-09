import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const gitSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../convex/_sandbox_runtime/git.ts",
  ),
  "utf8",
);

const gitCredentialsSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../convex/_sandbox_runtime/gitCredentials.ts",
  ),
  "utf8",
);

/**
 * A created-then-abandoned VM costs money for as long as it lives, and nothing in
 * the app ever looks for one: `createSandbox` threw during post-create setup
 * before returning the handle, so the caller's `sandbox` variable stayed unset
 * and its own cleanup could not fire (fix 710e2357). The only place that still
 * holds the handle is `createSandbox` itself.
 */
describe("createSandbox cleans up its own orphans", () => {
  const body = functionBody(gitSource, "export async function createSandbox(");

  test("wraps every post-create step in a try", () => {
    const createAt = body.indexOf("await client.create(");
    const tryAt = body.indexOf("\n    try {", createAt);
    expect(createAt, "client.create moved or was renamed").toBeGreaterThan(-1);
    expect(tryAt, "post-create setup is no longer wrapped").toBeGreaterThan(
      createAt,
    );
    // Nothing may touch the new sandbox between the create and the try, or a
    // throw there leaks the VM exactly as before.
    const gap = body.slice(createAt, tryAt);
    expect(gap).not.toContain("await sandbox.");
    expect(gap).not.toContain("execHandle(");
    expect(gap).not.toContain("runLoggedGitStep(");
  });

  test("deletes the sandbox when setup fails", () => {
    const handler = catchBody(body);
    expect(handler, "the post-create catch must delete the sandbox").toContain(
      "await sandbox.delete()",
    );
  });

  /** Swallowing the failure would hand the caller a half-built sandbox. */
  test("rethrows the original error", () => {
    expect(catchBody(body)).toContain("throw error;");
  });

  /**
   * A delete that throws must not replace the setup failure — the setup error is
   * the one that says why the sandbox was no good.
   */
  test("does not let a failed delete mask the setup error", () => {
    const handler = catchBody(body);
    const deleteAt = handler.indexOf("await sandbox.delete()");
    const guardAt = handler.lastIndexOf("try {", deleteAt);
    expect(
      guardAt,
      "sandbox.delete() must be inside its own try",
    ).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(guardAt);
    expect(handler.indexOf("throw error;")).toBeGreaterThan(deleteAt);
  });
});

/**
 * The outer half of the same guarantee: repo preparation runs after the handle
 * exists, so a failure there has to delete the sandbox the caller will never see.
 */
describe("createSandboxAndPrepareRepo cleans up on failure", () => {
  const body = functionBody(
    gitSource,
    "export async function createSandboxAndPrepareRepo(",
  );

  /**
   * The shared teardown also drops the credential-helper row, which is keyed by
   * sandbox id and would otherwise outlive the thing it authenticates.
   */
  test("deletes the sandbox and its credentials, then rethrows", () => {
    const deleteAt = body.indexOf("deleteSandboxAndCredentials(");
    expect(
      deleteAt,
      "prepare failures must delete the sandbox",
    ).toBeGreaterThan(-1);
    expect(body.indexOf("throw error;", deleteAt)).toBeGreaterThan(deleteAt);
  });
});

/** The one teardown every failed-setup path shares: VM first, then its credential row. */
describe("deleteSandboxAndCredentials", () => {
  const body = functionBody(
    gitCredentialsSource,
    "export async function deleteSandboxAndCredentials(",
  );

  test("deletes the VM best-effort, then the credential row", () => {
    const deleteAt = body.indexOf("await sandbox.delete()");
    expect(deleteAt).toBeGreaterThan(-1);
    expect(
      body.indexOf("internal.sandboxGitCredentials.deleteBySandboxId"),
    ).toBeGreaterThan(deleteAt);
  });
});

/**
 * Slices from a declaration to the next top-level one, so an assertion cannot be
 * satisfied by a match in a neighbouring function.
 */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source.slice(startAt, nextAt < 0 ? undefined : nextAt);
}

/** The last catch block in a function body — the one that owns the whole setup. */
function catchBody(body: string): string {
  const catchAt = body.lastIndexOf("} catch (error) {");
  expect(catchAt, "post-create catch moved or was renamed").toBeGreaterThan(-1);
  return body.slice(catchAt);
}
