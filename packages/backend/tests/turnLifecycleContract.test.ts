import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string =>
  readFileSync(join(testsDir, path), "utf8").replaceAll("\r\n", "\n");

test("the schema supports one indexed open turn and lease reconciliation", () => {
  const schema = source("../convex/schema.ts");
  expect(schema).toContain('turns: defineTable(turnFields)');
  expect(schema).toContain('.index("by_entity_open"');
  expect(schema).toContain('.index("by_open_lease"');
});

test("a turn is persisted before its workflow is launched", () => {
  const execution = source("../convex/_sessions/execution.ts");
  const openAt = execution.indexOf("await openSessionTurn(");
  const startAt = execution.indexOf(
    "internal.sessionWorkflow.sessionExecuteWorkflow",
  );
  expect(openAt).toBeGreaterThan(-1);
  expect(startAt).toBeGreaterThan(-1);
  expect(openAt).toBeLessThan(startAt);
});

test("pre-cutover workflow replays keep the V1 journal and argument shape", () => {
  const workflow = source("../convex/_sessions/workflow.ts");
  expect(workflow).toContain('turnId: v.optional(v.id("turns"))');
  expect(workflow).toContain("if (args.turnId !== undefined)");
  expect(workflow).toContain("args.turnId === undefined\n            ? null");
  expect(workflow).toContain(
    "...(args.turnId !== undefined ? { turnId: args.turnId } : {})",
  );
});

test("fatal completion uses the same fenced payload helper as normal completion", () => {
  const callback = source("../callback-src/index.ts");
  const bundle = source(
    "../convex/_sandbox_runtime/callbackScript.generated.ts",
  );
  const fatalAt = callback.indexOf('syncProviderStateToPersist("fatal-error")');
  const appendAt = callback.indexOf("appendCurrentTurnLease(errorArgs)", fatalAt);
  const deliverAt = callback.indexOf("callConvexWithRetry", fatalAt);
  expect(appendAt).toBeGreaterThan(fatalAt);
  expect(deliverAt).toBeGreaterThan(appendAt);
  expect(bundle).toContain("appendCurrentTurnLease(errorArgs)");
});

test("queued workflow start failures invoke durable rollback before surfacing", () => {
  const queues = source("../convex/_queues/helpers.ts");
  const catchAt = queues.indexOf("} catch (error) {", queues.indexOf("turnId,"));
  const rollbackAt = queues.indexOf("rollbackQueuedSessionStart", catchAt);
  const throwAt = queues.indexOf("throw error", catchAt);
  expect(rollbackAt).toBeGreaterThan(catchAt);
  expect(throwAt).toBeGreaterThan(rollbackAt);
});

test("the heartbeat fences stale writers before changing streaming state", () => {
  const http = source("../convex/http.ts");
  const turns = source("../convex/turns.ts");
  expect(http).toContain("internal.turns.heartbeat");
  const heartbeatAt = turns.indexOf("async function applyFencedHeartbeat");
  const renewAt = turns.indexOf("await renewTurnLease", heartbeatAt);
  const terminalAt = turns.indexOf('lease.status === "terminal"', heartbeatAt);
  const streamAt = turns.indexOf("await upsertStreamingActivity", heartbeatAt);
  expect(renewAt).toBeGreaterThan(-1);
  expect(terminalAt).toBeGreaterThan(renewAt);
  expect(streamAt).toBeGreaterThan(terminalAt);
  expect(http).toContain("internal.turns.legacyHeartbeat");
  expect(turns).toContain("await findOpenSessionTurn(ctx, sessionId)");
  const bundle = source(
    "../convex/_sandbox_runtime/callbackScript.generated.ts",
  );
  expect(bundle).toContain("turns:legacyHeartbeatFromCallback");
  expect(bundle).toContain("turns:heartbeatFromCallback");
  expect(bundle).not.toContain('"streaming:touch"');
  expect(bundle).not.toContain('"streaming:set"');
});

test("completion resolves the lease fence before publishing its event", () => {
  const workflow = source("../convex/_sessions/workflow.ts");
  const handlerAt = workflow.indexOf("export const handleCompletion");
  const resolutionAt = workflow.indexOf("resolveCompletionTurn", handlerAt);
  const eventAt = workflow.indexOf("sendCompletionEvent", handlerAt);
  expect(resolutionAt).toBeGreaterThan(handlerAt);
  expect(eventAt).toBeGreaterThan(resolutionAt);
});

test("expired leases are reconciled by a level-triggered cron", () => {
  const turns = source("../convex/turns.ts");
  const crons = source("../convex/crons.ts");
  expect(turns).toContain("turn.leaseExpiresAt >= Date.now()");
  expect(turns).toContain("internal.turns.finalizeExpired");
  expect(turns).toContain("retryEmptyStalledSessionTurn");
  expect(turns).toContain("lastLeaseWriteAt");
  expect(crons).toContain('"session turn lease reconcile"');
  expect(crons).toContain("internal.turns.reconcile");
});

test("every warm daemon uses the shared claimed-turn lifecycle", () => {
  for (const path of [
    "../callback-src/providers/claudeSdkDaemon.ts",
    "../callback-src/providers/cursorSdkDaemon.ts",
    "../callback-src/providers/codexAppServerDaemon.ts",
  ]) {
    const daemon = source(path);
    expect(daemon).toContain("readClaimedTurn");
    expect(daemon).toContain("startClaimedTurn(turn)");
    expect(daemon).toContain("appendClaimedTurnCompletion");
    expect(daemon).toContain("finishClaimedTurn()");
  }
  const lifecycle = source(
    "../callback-src/providers/claimedTurnLifecycle.ts",
  );
  expect(lifecycle).toContain("readTurnLeaseIdentity(result)");
  expect(lifecycle).toContain('beginTurnOwnership("claim", turn.turnLease)');
});

/**
 * The gate itself is behaviour-tested in callback-src/tests (the
 * canSendTurnHeartbeat truth table). What source cannot express behaviourally
 * is the wiring: every path that writes streaming state has to run through it,
 * and one unguarded emitter is the whole regression.
 */
test("every heartbeat emitter is gated on claimed turn ownership", () => {
  const heartbeats = source("../callback-src/runtime/heartbeats.ts");
  for (const emitter of [
    "async function sendStreamingHeartbeatUpdate",
    "async function flushStreamingPass",
    "async function heartbeatPing",
    "async function initialHeartbeat",
  ]) {
    const startAt = heartbeats.indexOf(emitter);
    expect(startAt, emitter + " moved or was renamed").toBeGreaterThan(-1);
    const guardAt = heartbeats.indexOf("if (!ownsHeartbeatLease())", startAt);
    const bodyEndAt = heartbeats.indexOf("\n}", startAt);
    expect(guardAt, emitter + " lost its ownership guard").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(bodyEndAt);
  }
  expect(heartbeats).toContain(
    "ownership: getTurnOwnership()",
  );
});

test("one ownership state answers both the lease and the heartbeat gate", () => {
  const lease = source("../callback-src/runtime/turnLease.ts");
  // Three module globals used to describe this one fact and drifted apart.
  expect(lease.match(/^let \w+/gm)).toEqual([
    "let turnOwnership",
    "let terminalReason",
  ]);
  const lifecycle = source(
    "../callback-src/providers/claimedTurnLifecycle.ts",
  );
  expect(lifecycle).not.toContain("let activeClaimState");
});
