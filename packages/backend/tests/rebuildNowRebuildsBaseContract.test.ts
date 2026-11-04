import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const readConvex = (relative: string) =>
  readFileSync(join(convexDir, relative), "utf8").replace(/^\s*\/\/.*$/gm, "");

/**
 * The Snapshots page says "Rebuild Now always rebuilds the base Image". For an
 * app with Stop Commands the backend only re-seeded on top of the existing
 * base, so a toolchain or base-image change (the move to Ubuntu) could never
 * reach that app through the UI.
 */
test("a manual build forces the base Image rebuild", () => {
  const builds = readConvex("_repoSnapshots/builds.ts");
  const startAt = builds.indexOf("export const startBuild = authMutation");
  expect(startAt, "startBuild moved or was renamed").toBeGreaterThan(-1);
  const body = builds.slice(startAt, builds.indexOf("\n});", startAt));
  expect(body).toContain("forceImageRebuild: true");
});

/**
 * Forcing a base rebuild on an app that also seeds exposed two bugs in the
 * workflow, both pinned here.
 */
describe("base rebuild followed by seeding", () => {
  const workflow = readConvex("snapshotWorkflow.ts");

  /**
   * `config` is read before the base rebuild, so `config.baseSnapshotId` is
   * the PREVIOUS base — which the rebuild deletes once the new one is stored.
   * Seeding from it would boot from a deleted snapshot.
   */
  test("seeding boots from the base this build just captured", () => {
    expect(workflow).toContain("rebuiltBaseSnapshotId = effectiveBaseId;");
    const seedAt = workflow.indexOf("const seedImageSnapshot =");
    expect(seedAt, "the seed source moved").toBeGreaterThan(-1);
    const decl = workflow.slice(seedAt, workflow.indexOf(";", seedAt));
    expect(decl.indexOf("rebuiltBaseSnapshotId")).toBeGreaterThan(-1);
    expect(
      decl.indexOf("rebuiltBaseSnapshotId"),
      "the fresh id must win over the stale config value",
    ).toBeLessThan(decl.indexOf("config.baseSnapshotId"));
  });

  /**
   * completeBuild ignores a build that is no longer "running". Marking the
   * build successful after the base step hid the seed step's own result and
   * let a second Rebuild Now start alongside the first.
   */
  test("the base step completes the build only when nothing is seeded next", () => {
    const successAt = workflow.indexOf(
      "built successfully.\\n`,\n          });",
    );
    expect(successAt, "the base-only success moved").toBeGreaterThan(-1);
    const guard = workflow.slice(Math.max(0, successAt - 700), successAt);
    expect(guard).toMatch(
      /if \(hasStopCommands\) \{[\s\S]*appendLogs[\s\S]*\} else \{/,
    );
  });
});
