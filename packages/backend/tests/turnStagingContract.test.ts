import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

const executionSource = readFileSync(
  join(testsDir, "../convex/_sessions/execution.ts"),
  "utf8",
);

const queueHelpersSource = readFileSync(
  join(testsDir, "../convex/_queues/helpers.ts"),
  "utf8",
);

const sessionWorkflowSource = readFileSync(
  join(testsDir, "../convex/_sessions/workflow.ts"),
  "utf8",
);
const projectChatWorkflowSource = readFileSync(
  join(testsDir, "../convex/projectChatWorkflow.ts"),
  "utf8",
);
const taskChatWorkflowSource = readFileSync(
  join(testsDir, "../convex/agentTaskChatWorkflow.ts"),
  "utf8",
);

/**
 * A turn is staged in two places: the shared session stager (a fresh send, and
 * the retry after an empty stall) and the queued-message dequeue. Both must
 * wipe `streamingActivity` first.
 *
 * The daemon's post-completion reconcile heartbeat races the workflow's
 * `clearStreamingActivity` in `saveResult`. When the heartbeat lands last it
 * resurrects a row holding the finished turn's full activity, so the next
 * turn's placeholder flashes the previous turn's thinking trace. Clearing at
 * staging time makes the placeholder start clean whichever way the race lands.
 */
test("staging a chat turn clears streamingActivity before the placeholder", () => {
  const stager = functionBody(
    executionSource,
    "async function stageAndStartChatTurn(",
  );
  // The row is keyed by the chat's own streaming entity id, so clearing the
  // session id would pass the ordering check while leaving the stale row.
  const keyAt = stager.indexOf(
    "const streamingEntityId = sessionChatStreamingEntityId(chat._id);",
  );
  const clearAt = stager.indexOf(
    "await clearStreamingActivity(ctx, streamingEntityId);",
  );
  const placeholderAt = stager.indexOf('await ctx.db.insert("messages"');
  expect(keyAt, "the stager must key the clear by the chat").toBeGreaterThan(-1);
  expect(
    clearAt,
    "the chat stager must clear streamingActivity",
  ).toBeGreaterThan(keyAt);
  expect(placeholderAt).toBeGreaterThan(-1);
  expect(clearAt).toBeLessThan(placeholderAt);
});

/**
 * The three queue arms (session, project chat, task chat) no longer stage
 * their own turns — they are thin `ChatQueueConfig` bindings onto one shared
 * dequeue (`startNextQueuedChatMessage` in convex/_queues/helpers.ts), so the
 * clear-before-stage order is that shared function's property now, not each
 * config's own.
 */
test("the shared dequeue clears streamingActivity before staging the user turn", () => {
  const body = functionBody(
    queueHelpersSource,
    "async function startNextQueuedChatMessage<",
  );
  const clearAt = body.indexOf("await clearStreamingActivity(");
  const insertAt = body.indexOf("config.insertUserMessage(");
  expect(
    clearAt,
    "startNextQueuedChatMessage must clear streamingActivity",
  ).toBeGreaterThan(-1);
  expect(insertAt).toBeGreaterThan(-1);
  expect(clearAt).toBeLessThan(insertAt);
});

/**
 * Each config still stages a user-role message when its turn is dequeued —
 * that part of the behavior is per-surface (message shape differs), even
 * though the shared core now owns the clear-then-insert ordering.
 */
test.each([
  "sessionChatQueueConfig",
  "projectChatQueueConfig",
  "taskChatQueueConfig",
])("%s inserts a user-role message", (name) => {
  const body = configBody(queueHelpersSource, name);
  expect(body).toContain('role: "user"');
});

/**
 * Chat rows are keyed by a prefixed entityId, so clearing the bare id would
 * pass the ordering test above while leaving the stale row exactly where it
 * was. Each config's `streamingEntityId` closure is what the shared core
 * calls to compute the key it clears.
 */
test.each([
  { name: "projectChatQueueConfig", prefix: "PROJECT_CHAT_STREAM_PREFIX" },
  { name: "taskChatQueueConfig", prefix: "TASK_CHAT_STREAM_PREFIX" },
])("$name's streamingEntityId uses the prefixed key", ({ name, prefix }) => {
  const body = configBody(queueHelpersSource, name);
  expect(body).toContain(`\`\${${prefix}}\${String(id)}\``);
});

/**
 * A hard provider-worker crash cannot serialize its in-memory steps. The
 * supervisor reports a null log, so saveResult must copy the last streaming
 * snapshot before deleting that row; otherwise the error replaces every step
 * the user already watched with an empty activity panel.
 */
test.each([
  ["session", sessionWorkflowSource],
  ["project chat", projectChatWorkflowSource],
  ["task chat", taskChatWorkflowSource],
])("%s saveResult preserves streamed activity after a worker crash", (_, source) => {
  const body = functionBody(source, "export const saveResult = internalMutation({");
  const readAt = body.indexOf('.query("streamingActivity")');
  const fallbackAt = body.indexOf(
    "args.activityLog || streaming?.currentActivity",
  );
  const clearAt = body.indexOf("await clearStreamingActivity(");
  const patchAt = body.indexOf("patch.activityLog = activityLog");
  expect(readAt, "saveResult no longer reads the live snapshot").toBeGreaterThan(
    -1,
  );
  expect(fallbackAt, "null worker logs no longer fall back").toBeGreaterThan(-1);
  expect(clearAt, "saveResult no longer clears streaming state").toBeGreaterThan(
    -1,
  );
  expect(patchAt, "the preserved log is not persisted").toBeGreaterThan(-1);
  expect(readAt).toBeLessThan(clearAt);
  expect(fallbackAt).toBeLessThan(clearAt);
  expect(clearAt).toBeLessThan(patchAt);
});

/**
 * Slices from a top-level function header to the `\n}` that closes it at
 * column 0 — nested closing braces stay indented so they cannot satisfy this.
 */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One `const name: SomeConfig<...> = {...}` object literal, ending on the `\n};` that closes it. */
function configBody(source: string, name: string): string {
  const startAt = source.indexOf(`const ${name}:`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n};", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}
