import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const workflowWatchdog = readSource("convex/workflowWatchdog.ts");
const stallWatchdog = readSource("convex/_chat/stallWatchdog.ts");
const surfaceAdapters = readSource("convex/_chat/surfaceAdapters.ts");

const RUN_STALE_CHECK_HEADER =
  "export async function runStaleChatHeartbeatCheck<TId extends ChatId, TEntity>(";
const RUN_STALE_PROBE_HEADER =
  "export async function runStaleChatLivenessProbe<TId extends ChatId, TEntity>(";
const FINALIZE_HEADER =
  "export async function finalizeStaleChatTurn<TId extends ChatId, TEntity>(";

/**
 * A session/task-chat/project-chat turn whose agent process dies silently
 * (OOM) stops heartbeating streamingActivity within seconds, but the chat
 * used to sit on "Working…" until the 2-hour handleStaleX backstop. The
 * heartbeat chain below turns that into a clear failure within minutes.
 *
 * The chain is one implementation (`_chat/stallWatchdog.ts`) shared by all
 * three chat surfaces; only the entity-specific details (field names, alert
 * wording, interrupt mechanics, the sandbox-status field) come from each
 * surface's `ChatSurfaceAdapter` (`_chat/surfaceAdapters.ts`). These rules pin
 * the shared safety properties once, then pin each adapter's own specifics
 * separately (see staleTurnDecision.test.ts for the threshold values).
 */
describe("shared chat stall watchdog implementation (_chat/stallWatchdog.ts)", () => {
  test("the heartbeat check only ever acts on the workflow it was armed for", () => {
    const body = functionBody(stallWatchdog, RUN_STALE_CHECK_HEADER);
    const guardAt = body.indexOf(
      "adapter.activeWorkflowId(entity) !== args.workflowId",
    );
    const finalizeAt = body.indexOf("finalizeStaleChatTurn(");
    expect(guardAt, "the workflow guard moved").toBeGreaterThan(-1);
    expect(finalizeAt, "the finalize call moved").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(finalizeAt);
  });

  test("a stale turn is probed for liveness before it is killed", () => {
    const body = functionBody(stallWatchdog, RUN_STALE_CHECK_HEADER);
    const probeAt = body.indexOf("adapter.scheduleProbe(");
    const finalizeAt = body.indexOf("finalizeStaleChatTurn(");
    expect(probeAt, "the liveness probe moved").toBeGreaterThan(-1);
    expect(probeAt).toBeLessThan(finalizeAt);

    const probe = functionBody(stallWatchdog, RUN_STALE_PROBE_HEADER);
    expect(probe).toContain("verifySandboxLiveness");
    // An alive probe must reset the clock, not kill.
    expect(probe).toContain("internalTouch");
  });

  test("the probe distinguishes a gone sandbox VM from a dead process on a live one", () => {
    // The Vercel runtime limit stops the VM mid-turn: the chat froze on
    // "Working…" with no indication, and only the provider dashboard showed
    // why. "sandbox_not_started" means the VM itself is gone; the kill must
    // not exec on it (exec lazily resumes it — see prewarmNeverResurrects).
    const probe = functionBody(stallWatchdog, RUN_STALE_PROBE_HEADER);
    expect(probe).toContain(
      'sandboxStopped: liveness.reason === "sandbox_not_started"',
    );
  });

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
 * Everything below pins one adapter's own specifics: which field tracks the
 * active workflow, how a live process gets interrupted, which sandbox-status
 * field a stopped sandbox closes, and that the thin wrappers in
 * workflowWatchdog.ts still wire to the shared implementation with the right
 * adapter constant.
 */
describe("session chat adapter (_chat/surfaceAdapters.ts)", () => {
  test("every tracked session workflow arms the heartbeat chain", () => {
    const body = functionBody(
      surfaceAdapters,
      "export async function trackSessionWorkflow(",
    );
    expect(body).toContain("checkStaleSessionHeartbeat");
  });

  test("checkStaleSessionHeartbeat and probeStaleSessionLiveness wire to the shared implementation with sessionChatAdapter", () => {
    const check = definitionBody(
      workflowWatchdog,
      "checkStaleSessionHeartbeat",
    );
    expect(check).toContain(
      "runStaleChatHeartbeatCheck(ctx, sessionChatAdapter,",
    );

    const probe = definitionBody(workflowWatchdog, "probeStaleSessionLiveness");
    expect(probe).toContain(
      "runStaleChatLivenessProbe(ctx, sessionChatAdapter,",
    );
  });

  test("handleStaleSession finalizes via the shared implementation with the session's own timeout alert", () => {
    const handler = definitionBody(workflowWatchdog, "handleStaleSession");
    expect(handler).toContain("finalizeStaleChatTurn(");
    expect(handler).toContain("sessionChatAdapter.alerts.timeout");
  });

  test("a stopped sandbox closes the session and skips the interrupt via a direct kill", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "sessionChatAdapter",
      "const taskChatAdapter:",
    );
    // The UI must reflect the stop — users cannot see the provider dashboard.
    // The sandbox belongs to the session, so the chat's release flips the
    // status on the session row the chat points at.
    const releaseAt = adapter.indexOf("release: async (ctx, id, opts) => {");
    expect(releaseAt).toBeGreaterThan(-1);
    const release = adapter.slice(releaseAt, adapter.indexOf("drainQueue:"));
    expect(release).toContain("if (opts.sandboxStopped) {");
    expect(release).toContain("ctx.db.patch(chat.sessionId, {");
    expect(release).toContain('status: "closed"');
    expect(adapter).toContain("The session is now closed");
    // Session chats have no daemon-owning workflow field, so they always kill
    // the sandbox process directly rather than a named entity daemon.
    expect(adapter).toContain("killSandboxProcess");
    expect(adapter).not.toContain("killEntityDaemon");
  });

  test("release drains the whole session's queues and clears no extra streaming rows", () => {
    const adapter = adapterBody(
      surfaceAdapters,
      "sessionChatAdapter",
      "const taskChatAdapter:",
    );
    // A finished chat frees one of the session's parallel-run slots, so the
    // drain offers it to sibling chats too — not only this chat's own queue.
    expect(adapter).toContain("drainSessionChatQueues(ctx, chat.sessionId, id)");
    expect(adapter).toContain("extraStreamingClears: () => []");
  });
});

/** Task chat mirror of the session adapter checks above. */
describe("task chat adapter (_chat/surfaceAdapters.ts)", () => {
  test("every tracked task chat workflow arms the heartbeat chain", () => {
    const body = functionBody(
      surfaceAdapters,
      "export async function trackAgentTaskChatWorkflow(",
    );
    expect(body).toContain("checkStaleAgentTaskChatHeartbeat");
  });

  test("checkStaleAgentTaskChatHeartbeat and probeStaleAgentTaskChatLiveness wire to the shared implementation with taskChatAdapter", () => {
    const check = definitionBody(
      workflowWatchdog,
      "checkStaleAgentTaskChatHeartbeat",
    );
    expect(check).toContain("runStaleChatHeartbeatCheck(ctx, taskChatAdapter,");

    const probe = definitionBody(
      workflowWatchdog,
      "probeStaleAgentTaskChatLiveness",
    );
    expect(probe).toContain("runStaleChatLivenessProbe(ctx, taskChatAdapter,");
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
  test("every tracked project chat workflow arms the heartbeat chain", () => {
    const body = functionBody(
      surfaceAdapters,
      "export async function trackProjectChatWorkflow(",
    );
    expect(body).toContain("checkStaleProjectChatHeartbeat");
  });

  test("checkStaleProjectChatHeartbeat and probeStaleProjectChatLiveness wire to the shared implementation with projectChatAdapter", () => {
    const check = definitionBody(
      workflowWatchdog,
      "checkStaleProjectChatHeartbeat",
    );
    expect(check).toContain(
      "runStaleChatHeartbeatCheck(ctx, projectChatAdapter,",
    );

    const probe = definitionBody(
      workflowWatchdog,
      "probeStaleProjectChatLiveness",
    );
    expect(probe).toContain(
      "runStaleChatLivenessProbe(ctx, projectChatAdapter,",
    );
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
