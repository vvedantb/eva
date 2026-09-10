import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const workflowWatchdog = readSource("convex/workflowWatchdog.ts");
const stallWatchdog = readSource("convex/_chat/stallWatchdog.ts");
const surfaceAdapters = readSource("convex/_chat/surfaceAdapters.ts");

const CHAT_WRAPPER_NAMES = [
  "handleStaleSession",
  "checkStaleSessionHeartbeat",
  "probeStaleSessionLiveness",
  "handleStaleProjectChat",
  "checkStaleProjectChatHeartbeat",
  "probeStaleProjectChatLiveness",
  "handleStaleAgentTaskChat",
  "checkStaleAgentTaskChatHeartbeat",
  "probeStaleAgentTaskChatLiveness",
];

/**
 * workflowWatchdog.ts used to hold three near-identical copies of the chat
 * stall-watchdog machinery (sessions, task chat, project chat) — a fix (e.g.
 * the salvage-read-before-clear ordering) landed on one surface and had to be
 * manually ported to the other two by hand. The refactor moved the one true
 * implementation into `_chat/stallWatchdog.ts` (shared logic) and
 * `_chat/surfaceAdapters.ts` (per-surface adapters); these rules exist to
 * catch a regression back toward duplicated logic in the thin wrappers.
 */
describe("the nine chat wrappers in workflowWatchdog.ts only delegate", () => {
  test.each(CHAT_WRAPPER_NAMES)(
    "%s does not itself patch the entity, insert a message, or finalize a cancelled message",
    (name) => {
      const body = definitionBody(workflowWatchdog, name);
      expect(body, `${name} writes ctx.db.patch directly`).not.toContain(
        "ctx.db.patch(",
      );
      expect(body, `${name} inserts a message directly`).not.toContain(
        'insert("messages"',
      );
      expect(
        body,
        `${name} finalizes a cancelled message directly`,
      ).not.toContain("finalizeCancelledAssistantMessage(");
    },
  );
});

/**
 * The standalone system-alert message is the one write every stale-turn kill
 * must produce. Three copies of this insert (one per surface) is exactly the
 * drift the refactor removes — it must exist exactly once in the shared
 * implementation.
 */
test("finalizeStaleChatTurn inserts the isSystemAlert message exactly once", () => {
  const matches = stallWatchdog.match(/isSystemAlert: true/g) ?? [];
  expect(matches).toHaveLength(1);
});

/**
 * chatSurfaceAdapters is the single registration point for every chat
 * surface the shared watchdog knows about. A fourth surface — or one of the
 * existing three quietly dropped — must show up here.
 */
test("all three chat surface adapters are registered together in chatSurfaceAdapters", () => {
  const startAt = surfaceAdapters.indexOf(
    "export const chatSurfaceAdapters = [",
  );
  expect(startAt, "chatSurfaceAdapters moved or was renamed").toBeGreaterThan(
    -1,
  );
  const endAt = surfaceAdapters.indexOf("] as const;", startAt);
  expect(endAt, "the chatSurfaceAdapters array close moved").toBeGreaterThan(
    -1,
  );
  const body = surfaceAdapters.slice(startAt, endAt);
  expect(body).toContain("sessionChatAdapter");
  expect(body).toContain("taskChatAdapter");
  expect(body).toContain("projectChatAdapter");
});

/**
 * The usage-limit retry shipped for sessions only (#734) because nothing
 * pinned the three chat surfaces to the same mutation set. This does.
 */
test("every chat surface's workflow module exposes the same user-facing recovery mutations", () => {
  for (const module of [
    "convex/sessionWorkflow.ts",
    "convex/agentTaskChatWorkflow.ts",
    "convex/projectChatWorkflow.ts",
  ]) {
    const source = readSource(module);
    expect(source, `${module} is missing retryLastTurnWithAccount`).toContain(
      "retryLastTurnWithAccount",
    );
    expect(source, `${module} is missing requestStopBackgroundAgent`).toContain(
      "requestStopBackgroundAgent",
    );
  }
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
