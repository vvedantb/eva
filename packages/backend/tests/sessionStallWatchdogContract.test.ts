import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const workflowWatchdog = readSource("convex/workflowWatchdog.ts");
const stallWatchdog = readSource("convex/_chat/stallWatchdog.ts");
const surfaceAdapters = readSource("convex/_chat/surfaceAdapters.ts");

const FINALIZE_HEADER =
  "export async function finalizeStaleChatTurn<TId extends ChatId, TEntity>(";

/**
 * A stalled chat turn is torn down by one implementation
 * (`finalizeStaleChatTurn` in `_chat/stallWatchdog.ts`), reached from the
 * lease reconciler (`turns.finalizeExpired`) and the 2-hour backstop. Only the
 * entity-specific details (field names, alert wording, interrupt mechanics,
 * the sandbox-status field) come from each surface's `ChatSurfaceAdapter`
 * (`_chat/surfaceAdapters.ts`). These rules pin the shared safety properties
 * once, then pin each adapter's own specifics separately.
 */
describe("shared chat stall watchdog implementation (_chat/stallWatchdog.ts)", () => {
  test("the salvage reads the streaming row before the clear wipes it", () => {
    const body = functionBody(stallWatchdog, FINALIZE_HEADER);
    const readAt = body.indexOf('query("streamingActivity")');
    const cancelAt = body.indexOf("cancelStaleWorkflow(");
    expect(readAt, "the streaming read moved").toBeGreaterThan(-1);
    expect(cancelAt, "the workflow cancel moved").toBeGreaterThan(-1);
    expect(readAt).toBeLessThan(cancelAt);
  });

  test("a stopped sandbox skips the interrupt", () => {
    const body = functionBody(stallWatchdog, FINALIZE_HEADER);
    const stoppedGuardAt = body.indexOf("opts.sandboxStopped !== true");
    const interruptAt = body.indexOf("adapter.interrupt(ctx, entity)");
    expect(stoppedGuardAt, "the stopped-sandbox guard moved").toBeGreaterThan(
      -1,
    );
    expect(interruptAt, "the interrupt call moved").toBeGreaterThan(-1);
    expect(stoppedGuardAt).toBeLessThan(interruptAt);
  });

  test("the kill alerts the user, releases the entity and drains the queue", () => {
    const body = functionBody(stallWatchdog, FINALIZE_HEADER);
    expect(body).toContain("isSystemAlert: true");
    expect(body).toContain("adapter.release(ctx, id,");
    expect(body).toContain("adapter.drainQueue(ctx, id)");
  });
});

/**
 * The durable turn's lease is the only stall check (decision 2 of the
 * durable-turns plan). The old heartbeat chain and its one-release no-op stubs
 * are deleted; nothing may define or schedule them again.
 */
const RETIRED_STALL_CHECKS = [
  "checkStaleSessionHeartbeat",
  "probeStaleSessionLiveness",
  "checkStaleAgentTaskChatHeartbeat",
  "probeStaleAgentTaskChatLiveness",
  "checkStaleProjectChatHeartbeat",
  "probeStaleProjectChatLiveness",
];

describe("the lease is the only chat stall check", () => {
  test.each(RETIRED_STALL_CHECKS)("%s is no longer defined", (name) => {
    expect(workflowWatchdog).not.toContain(`export const ${name} =`);
  });

  test("no adapter or tracker schedules a retired stall check", () => {
    for (const name of RETIRED_STALL_CHECKS) {
      expect(surfaceAdapters).not.toContain(
        `internal.workflowWatchdog.${name}`,
      );
    }
  });
});

/**
 * Everything below pins one adapter's own specifics: which field tracks the
 * active workflow, how a live process gets interrupted, and which
 * sandbox-status field a stopped sandbox closes.
 */
describe("session chat adapter (_chat/surfaceAdapters.ts)", () => {
  test("a tracked session workflow arms only the 2-hour backstop", () => {
    const body = functionBody(
      surfaceAdapters,
      "export async function trackSessionWorkflow(",
    );
    expect(body).toContain("handleStale");
    expect(body).not.toContain("scheduleCheck");
  });

  test("handleStaleSessionChat finalizes via the shared implementation with the chat's own timeout alert", () => {
    const handler = definitionBody(workflowWatchdog, "handleStaleSessionChat");
    expect(handler).toContain("finalizeStaleChatTurn(");
    expect(handler).toContain("sessionChatAdapter.alerts.timeout");
    // The session-level teardown (the summary lane) cancels the workflow and
    // alerts in the Main chat; the lease reconciler reuses it for a stalled summary.
    const teardownAt = workflowWatchdog.indexOf(
      "export async function tearDownStaleSessionWorkflow(",
    );
    expect(teardownAt).toBeGreaterThan(-1);
    const teardown = workflowWatchdog.slice(
      teardownAt,
      workflowWatchdog.indexOf("\n}", teardownAt),
    );
    expect(teardown).toContain("cancelStaleWorkflow(");
    expect(teardown).toContain("ensureMainChat(");
  });

  test("a stopped sandbox closes the chat's session, and a live non-Claude daemon is killed by name", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "sessionChatAdapter",
      "const taskChatAdapter:",
    );
    // The UI must reflect the stop — users cannot see the provider dashboard.
    // The sandbox is the session's, so its status is what flips.
    expect(adapter).toContain('status: "closed"');
    // The dead turn's staged prompt must not block the next one.
    expect(adapter).toContain("pendingTurn: undefined");
    // A Claude daemon is interrupted in place; any other daemon is killed by
    // its chat-scoped pidfile so a sibling chat's daemon survives.
    expect(adapter).toContain("cancelRequestedAt: Date.now()");
    expect(adapter).toContain("killEntityDaemon");
    expect(adapter).toContain('entityIdField: "chatId"');
  });

  test("release drains the chat's own queue, then its siblings', and clears no extra streaming rows", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "sessionChatAdapter",
      "const taskChatAdapter:",
    );
    expect(adapter).toContain("drainSessionChatQueues(ctx, chat.sessionId, id)");
    // The summary streaming row belongs to the session, not to any chat.
    expect(adapter).toContain("extraStreamingClears: () => []");
  });
});

/** Task chat mirror of the session adapter checks above. */
describe("task chat adapter (_chat/surfaceAdapters.ts)", () => {
  test("a tracked task chat workflow arms only the 2-hour backstop", () => {
    const body = functionBody(
      surfaceAdapters,
      "export async function trackAgentTaskChatWorkflow(",
    );
    expect(body).toContain("handleStale");
    expect(body).not.toContain("scheduleCheck");
  });

  test("handleStaleAgentTaskChat finalizes via the shared implementation with the task's own timeout alert", () => {
    const handler = definitionBody(
      workflowWatchdog,
      "handleStaleAgentTaskChat",
    );
    expect(handler).toContain("finalizeStaleChatTurn(");
    expect(handler).toContain("taskChatAdapter.alerts.timeout");
  });

  test("a stopped sandbox closes the task sandbox status, and a live daemon is killed by name", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "taskChatAdapter",
      "const projectChatAdapter:",
    );
    expect(adapter).toContain('patch.reviewTaskSandboxStatus = "closed"');
    expect(adapter).toContain("The sandbox is now closed");
    // A task with its own active run workflow kills that named daemon rather
    // than the whole sandbox process.
    expect(adapter).toContain("task.activeWorkflowId");
    expect(adapter).toContain("killEntityDaemon");
    expect(adapter).toContain("killSandboxProcess");
  });

  test("release drains the task's own queue and clears no extra streaming rows", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "taskChatAdapter",
      "const projectChatAdapter:",
    );
    expect(adapter).toContain("startNextQueuedTaskChatMessage(ctx, id)");
    expect(adapter).toContain("extraStreamingClears: () => []");
  });
});

/** Project chat mirror of the session adapter checks above. */
describe("project chat adapter (_chat/surfaceAdapters.ts)", () => {
  test("a tracked project chat workflow arms only the 2-hour backstop", () => {
    const body = functionBody(
      surfaceAdapters,
      "export async function trackProjectChatWorkflow(",
    );
    expect(body).toContain("handleStale");
    expect(body).not.toContain("scheduleCheck");
  });

  test("handleStaleProjectChat finalizes via the shared implementation with the project's own timeout alert", () => {
    const handler = definitionBody(workflowWatchdog, "handleStaleProjectChat");
    expect(handler).toContain("finalizeStaleChatTurn(");
    expect(handler).toContain("projectChatAdapter.alerts.timeout");
  });

  test("a stopped sandbox closes the project sandbox status, and a live daemon (chat or build) is killed by name", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "projectChatAdapter",
      "export const chatSurfaceAdapters",
    );
    expect(adapter).toContain('patch.reviewProjectSandboxStatus = "closed"');
    expect(adapter).toContain("The sandbox is now closed");
    // A project chat turn can share the sandbox with a build workflow — both
    // are checked, since either owns the same named daemon.
    expect(adapter).toContain(
      "project.activeWorkflowId || project.activeBuildWorkflowId",
    );
    expect(adapter).toContain("killEntityDaemon");
    expect(adapter).toContain("killSandboxProcess");
  });

  test("release drains the project's own queue and clears no extra streaming rows", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "projectChatAdapter",
      "export const chatSurfaceAdapters",
    );
    expect(adapter).toContain("startNextQueuedProjectChatMessage(ctx, id)");
    expect(adapter).toContain("extraStreamingClears: () => []");
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

/**
 * One `const name: ChatSurfaceAdapter<...> = {...}` object literal, bounded
 * by the next adapter/export marker rather than a brace count — the object's
 * closing `};` sits at a 2-space indent (from the `=\n  {` split), so it
 * cannot be found by the column-0 convention the other helpers rely on.
 */
function adapterBody(source: string, name: string, nextMarker: string): string {
  const startAt = source.indexOf(`const ${name}:`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf(nextMarker, startAt);
  expect(end, `${nextMarker} moved or was renamed`).toBeGreaterThan(-1);
  return source.slice(startAt, end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
