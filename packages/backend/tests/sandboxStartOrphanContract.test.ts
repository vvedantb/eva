import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const sessions = readSource("_sandbox_runtime/sessions.ts");

const CREATE = "createSandboxAndPrepareRepo(";
const TEARDOWN = "deleteSandboxAndCredentials(";

/**
 * Every start path creates a sandbox, then runs setup that can throw: ref sync,
 * branch checkout, config restore, seeded-runtime restore, dev server. A throw
 * used to leave the VM running with nothing referencing it, and the next retry
 * created another — a leak that bills until someone notices (fixes 31cbde2a for
 * the session path, 739dd53f for task and design).
 */
describe("a start that fails does not leak its new sandbox", () => {
  const owners = createSites();

  /** A new start path added without cleanup is the whole failure mode. */
  test("every create site is accounted for", () => {
    expect(owners.map((owner) => owner.name).sort()).toEqual([
      "preparePreviewSandboxInternal",
      "prepareSessionSandboxInternal",
    ]);
  });

  /**
   * The shared teardown deletes the VM and its credential row; a deleted VM
   * whose credential row survives leaves a dangling secret.
   */
  test.each(["prepareSessionSandboxInternal", "preparePreviewSandboxInternal"])("%s deletes the sandbox it created and its credentials", (name) => {
    const handler = catchBodyOf(owners, name);
    expect(handler, `${name} no longer deletes on failure`).toContain(
      TEARDOWN,
    );
  });

  /**
   * The exception, and it has to stay a deliberate one: the project path records
   * its sandbox on the project straight after create, so a failure leaves a
   * tracked sandbox rather than an orphan. Tasks have no such record, so they
   * delete.
   */
  test("the project path records its sandbox instead of deleting it", () => {
    const body = bodyOf(owners, "preparePreviewSandboxInternal");
    const createAt = body.indexOf(CREATE);
    expect(
      body.indexOf("hooks.afterCreate(", createAt),
      "the preview path no longer records its sandbox after create",
    ).toBeGreaterThan(createAt);
    expect(catchBodyOf(owners, "preparePreviewSandboxInternal")).toContain(
      "if (hooks.deleteOnSetupFailure) {",
    );

    const hooks = definitionOf("previewOwnerHooks");
    const projectAt = hooks.indexOf("const { projectId } = owner;");
    expect(projectAt, "the project arm moved").toBeGreaterThan(-1);
    const taskArm = hooks.slice(0, projectAt);
    const projectArm = hooks.slice(projectAt);
    expect(taskArm).toContain("deleteOnSetupFailure: true");
    expect(projectArm).toContain("deleteOnSetupFailure: false");
    expect(
      projectArm,
      "the project path now leaks on setup failure",
    ).toContain("internal.projects.projectSandboxAllocated");
  });

  /**
   * The one case where deleting is wrong: early-ready has already unlocked chat
   * on that VM, so the user may be mid-conversation. This is what nuked live
   * sandboxes when startup commands timed out (fix 2a0e08e5).
   */
  test("a session that already went live is kept, not deleted", () => {
    const handler = catchBodyOf(owners, "prepareSessionSandboxInternal");
    const guardAt = handler.indexOf("if (earlyReadyEmitted) {");
    expect(guardAt, "the keep-alive guard moved").toBeGreaterThan(-1);
    const deleteAt = handler.indexOf(TEARDOWN);
    expect(deleteAt, "the delete moved").toBeGreaterThan(-1);
    expect(guardAt, "the guard must come first").toBeLessThan(deleteAt);
    expect(
      handler.slice(guardAt, deleteAt),
      "the guarded branch has to return before reaching the delete",
    ).toContain("return {");
  });
});

/**
 * The top-level definitions in the file that create a sandbox, each as its own
 * source slice. Sliced on column-zero declarations, which is how this file is
 * laid out.
 */
function createSites(): { name: string; body: string }[] {
  return definitions().filter((definition) => definition.body.includes(CREATE));
}

function definitions(): { name: string; body: string }[] {
  const boundaries = [
    ...sessions.matchAll(/\n(?:export )?(?:async )?(?:function|const) (\w+)/g),
  ];
  return boundaries.map((match, index) => ({
    name: match[1],
    body: sessions.slice(
      match.index,
      boundaries[index + 1]?.index ?? sessions.length,
    ),
  }));
}

function definitionOf(name: string): string {
  return bodyOf(definitions(), name);
}

function bodyOf(
  owners: { name: string; body: string }[],
  name: string,
): string {
  const owner = owners.find((candidate) => candidate.name === name);
  expect(owner, `${name} moved or was renamed`).toBeDefined();
  return owner?.body ?? "";
}

/** Everything from the setup handler's `} catch` to the end of the definition. */
function catchBodyOf(
  owners: { name: string; body: string }[],
  name: string,
): string {
  const body = bodyOf(owners, name);
  const createAt = body.indexOf(CREATE);
  const catchAt = body.indexOf("} catch", createAt);
  expect(catchAt, `${name} no longer wraps its setup in a try`).toBeGreaterThan(
    createAt,
  );
  return body.slice(catchAt);
}

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
