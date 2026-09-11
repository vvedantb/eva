import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const daemonSource = readSource("callback-src/providers/claudeSdkDaemon.ts");
const oneShotSource = readSource("callback-src/index.ts");
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);
const sessionExecution = readSource("convex/_sessions/execution.ts");
const queueHelpers = readSource("convex/_queues/helpers.ts");

/**
 * The Working bubble renders `streamingActivity.currentContent` verbatim, and
 * the server clears that row when a turn completes — queued dequeues start the
 * NEXT turn inside the completion mutation itself. A daemon streaming write
 * that runs after delivering completion therefore lands after the next turn's
 * clear and resurrects the finished turn's full reply under the new
 * placeholder: users saw the previous answer as the response to their new
 * message until the real reply arrived (fix 60a9b977).
 */
describe("no streaming write after completion is delivered", () => {
  test("daemon source reconciles through the shared helper before completing", () => {
    const body = functionBody(daemonSource, "async function finalizeTurn(");
    const reconcileAt = body.indexOf("await reconcileStreamingAndPersist()");
    const completionAt = body.indexOf("await deliverCompletionWithMedia(");
    expect(reconcileAt, "the final reconcile moved").toBeGreaterThan(-1);
    expect(completionAt, "the completion call moved").toBeGreaterThan(-1);
    expect(reconcileAt).toBeLessThan(completionAt);
    const afterCompletion = body.slice(completionAt);
    expect(afterCompletion).not.toContain("setFinalizingState");
    expect(afterCompletion).not.toContain("reconcileStreamingAndPersist");
    expect(afterCompletion).not.toContain("sendStreamingHeartbeatUpdate");
    expect(afterCompletion).not.toContain("flushStreaming(");
  });

  test("deployed bundle still reconciles before completing", () => {
    const body = functionBody(bundledScript, "async function finalizeTurn(");
    const reconcileAt = body.indexOf("await setFinalizingState()");
    const completionAt = body.indexOf("await deliverCompletionWithMedia(");
    expect(reconcileAt, "the final reconcile moved").toBeGreaterThan(-1);
    expect(completionAt, "the completion call moved").toBeGreaterThan(-1);
    expect(reconcileAt).toBeLessThan(completionAt);
    const afterCompletion = body.slice(completionAt);
    expect(afterCompletion).not.toContain("setFinalizingState");
    expect(afterCompletion).not.toContain("sendStreamingHeartbeatUpdate");
    expect(afterCompletion).not.toContain("flushStreaming(");
  });

  test("the one-shot attempt reconciles before completing", () => {
    const reconcileAt = oneShotSource.indexOf("await setFinalizingState()");
    const completionAt = oneShotSource.indexOf(
      "await deliverCompletionWithMedia(",
    );
    expect(reconcileAt, "the final reconcile moved").toBeGreaterThan(-1);
    expect(completionAt, "the completion call moved").toBeGreaterThan(-1);
    expect(reconcileAt).toBeLessThan(completionAt);
  });
});

/**
 * Warm daemons keep running the script they were spawned with, so sandboxes
 * that predate fix 60a9b977 (and any crashed turn) can still leave a populated
 * streaming row behind. Each turn start wipes the row before its own bubble
 * exists to render it.
 */
describe("every turn start clears the streaming row first", () => {
  // A session turn is staged in one place now — startExecute and the
  // empty-stall retry both call the shared helper — so the ordering is that
  // helper's property, not the mutation's.
  test("the shared session stager clears before staging the placeholder", () => {
    const body = functionBody(
      sessionExecution,
      "async function stageAndStartSessionTurn(",
    );
    const clearAt = body.indexOf("clearStreamingActivity(");
    const placeholderAt = body.indexOf('ctx.db.insert("messages"');
    expect(clearAt, "the streaming clear moved").toBeGreaterThan(-1);
    expect(placeholderAt, "the placeholder insert moved").toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(placeholderAt);
  });

  test.each(["startExecute", "retryEmptyStalledSessionTurn"])(
    "%s stages through that helper rather than its own placeholder",
    (name) => {
      const body = definitionBody(sessionExecution, name);
      expect(body).toContain("stageAndStartSessionTurn(ctx, {");
      expect(body).not.toContain('ctx.db.insert("messages"');
    },
  );

  // The three startNextQueuedX functions are now thin config bindings onto one
  // shared dequeue (startNextQueuedChatMessage in convex/_queues/helpers.ts) —
  // the clear-before-insert order is its property, not each surface's own.
  test("the shared dequeue clears before inserting the user turn", () => {
    const body = functionBody(
      queueHelpers,
      "async function startNextQueuedChatMessage<",
    );
    const clearAt = body.indexOf("clearStreamingActivity(");
    const insertAt = body.indexOf("config.insertUserMessage(");
    expect(clearAt, "the streaming clear moved").toBeGreaterThan(-1);
    expect(insertAt, "the user-turn insert moved").toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(insertAt);
  });

  test.each([
    "sessionQueueConfig",
    "projectChatQueueConfig",
    "taskChatQueueConfig",
  ])("%s inserts a user-role message when a queued turn starts", (name) => {
    const body = configBody(queueHelpers, name);
    expect(body).toContain('role: "user"');
  });

  test.each([
    ["startNextQueuedSessionMessage", "sessionQueueConfig"],
    ["startNextQueuedProjectChatMessage", "projectChatQueueConfig"],
    ["startNextQueuedTaskChatMessage", "taskChatQueueConfig"],
  ])("%s still delegates to the shared dequeue with %s", (name, configName) => {
    const body = functionBody(queueHelpers, `export function ${name}(`);
    expect(body).toContain(
      `startNextQueuedChatMessage(ctx, ${name === "startNextQueuedSessionMessage" ? "sessionId" : name === "startNextQueuedProjectChatMessage" ? "projectId" : "taskId"}, ${configName})`,
    );
  });
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

/** One top-level function, ending on the `\n}` that closes it at column 0. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One `const name: SomeConfig<...> = {...}` object literal, ending on the `\n};` that closes it. */
function configBody(source: string, name: string): string {
  const startAt = source.indexOf(`const ${name}:`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n};", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
