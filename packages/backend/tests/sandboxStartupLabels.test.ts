import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Regression guard for commit 05532b5c7.
 *
 * `SANDBOX_STARTUP_LABELS` is written out twice: the watchdog uses it to decide
 * that a turn sitting on startup plumbing is not stalled, and the shared
 * activity reader uses it to collapse a whole boot into one line instead of
 * showing the user cloning, installing and checking out. Nothing links the two
 * copies, so adding a label to the pipeline and only teaching the watchdog
 * about it silently un-collapses the boot in every chat.
 *
 * Neither set is exported, so the lists are lifted out of the source. Compare
 * the labels, not the formatting.
 */
function startupLabels(relativePath: string): string[] {
  const source = readFileSync(join(backendDir, relativePath), "utf8");
  const at = source.indexOf("const SANDBOX_STARTUP_LABELS = new Set([");
  expect(
    at,
    `SANDBOX_STARTUP_LABELS moved or was renamed in ${relativePath}`,
  ).toBeGreaterThan(-1);
  const body = source.slice(at, source.indexOf("]);", at));
  const labels = [...body.matchAll(/"([^"]*)"/g)].map(
    (match) => match[1] ?? "",
  );
  expect(labels.length, `no labels found in ${relativePath}`).toBeGreaterThan(
    0,
  );
  return labels;
}

test("the watchdog and the activity reader agree on the startup labels", () => {
  expect(startupLabels("../shared/src/utils/parseActivitySteps.ts")).toEqual(
    startupLabels("convex/_taskWorkflow/staleness.ts"),
  );
});
