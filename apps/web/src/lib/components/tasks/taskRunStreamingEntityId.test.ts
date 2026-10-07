import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { taskRunStreamingEntityId } from "./firstRunChatTurn";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
);
const helpers = readFileSync(
  join(repoRoot, "packages/backend/convex/_taskWorkflow/helpers.ts"),
  "utf8",
);

/**
 * A quick task's first run streams its live activity into the chat bubble by
 * reading `streaming.get` for the row the task workflow writes. The workflow
 * names that row with `getTaskRunStreamingEntityId`, which lives inside the
 * Convex package and is not exported to the client, so the client re-spells the
 * format in `taskRunStreamingEntityId`.
 *
 * Nothing links the two: change the server's format and the client keeps
 * subscribing to a row that no longer exists. The type-check passes, the query
 * resolves, and the bubble just sits empty for the whole run — the exact
 * failure the in-flight chat turn was built to remove.
 */
test("the client mirrors the server's task-run streaming entity id", () => {
  const at = helpers.indexOf("export function getTaskRunStreamingEntityId");
  expect(at, "the server helper moved or was renamed").toBeGreaterThan(-1);
  const body = helpers.slice(at, helpers.indexOf("\n}", at));

  expect(
    body,
    "the server's entity-id format changed; update taskRunStreamingEntityId",
  ).toContain("return `task-run-${String(runId)}`;");
  expect(taskRunStreamingEntityId("run-1")).toBe("task-run-run-1");
});
