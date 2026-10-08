import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(testsDir, relativePath), "utf8");
}

const daemonSource = readSource(
  "../callback-src/providers/claudeSdkDaemon.ts",
);
const sessionWorkflowSource = readSource("../convex/_sessions/workflow.ts");
const taskDaemonSource = readSource("../convex/_chat/taskChatDaemon.ts");
const projectDaemonSource = readSource("../convex/_chat/projectChatDaemon.ts");

/**
 * A synthetic turn's assistant row is stamped as a provider checkpoint for the
 * handoff catch-up (see `_shared/modelHandoff.ts`). The sticky composer pick
 * (`lastModel` / `lastChatModel`) can move to another provider while the turn
 * is open, so the stamp must come from the daemon that actually runs it —
 * `chat.lastModel` is only the fallback for daemons launched before the
 * protocol carried a model.
 */
describe("synthetic turn checkpoint stamping", () => {
  test("the daemon sends its own model when opening a synthetic turn", () => {
    const ensureSyntheticTurn = daemonSource.slice(
      daemonSource.indexOf("async function ensureSyntheticTurn"),
      daemonSource.indexOf("readSyntheticTurnMessageId(result)"),
    );
    expect(ensureSyntheticTurn).toContain(
      "entityMutationArgs({ model: MODEL })",
    );
  });

  test("every openSyntheticTurn prefers the daemon's model over the sticky pick", () => {
    expect(sessionWorkflowSource).toContain(
      "normalizeAIModel(args.model ?? chat.lastModel)",
    );
    expect(taskDaemonSource).toContain(
      "normalizeAIModel(args.model ?? task.lastChatModel ?? task.model)",
    );
    expect(projectDaemonSource).toContain(
      "args.model ?? project.lastChatModel ?? project.model",
    );
  });
});
