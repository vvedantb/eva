import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  DAEMON_CLAIM_PAUSE_MS,
  isDaemonClaimPaused,
  shouldDeferDaemonRespawn,
  type DaemonTurnSnapshot,
} from "../convex/_chat/daemonClaimPause";

const testsDir = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string =>
  readFileSync(join(testsDir, path), "utf8").replaceAll("\r\n", "\n");

const executionSource = source("../convex/_sandbox_runtime/execution.ts");

function functionBody(text: string, declaration: string): string {
  const startAt = text.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const nextAt = text.indexOf("\nexport ", startAt + 1);
  return text.slice(startAt, nextAt < 0 ? undefined : nextAt);
}

const NOW = 1_800_000_000_000;

function snapshot(
  overrides: Partial<DaemonTurnSnapshot> = {},
): DaemonTurnSnapshot {
  return {
    pendingTurnStaged: false,
    activeWorkflow: undefined,
    syntheticTurnMessageId: undefined,
    ...overrides,
  };
}

/**
 * The prod shape (session 125): prewarm dispatches the kill, and 1–137ms later
 * the doomed daemon's 50ms poll claims the staged turn, acquires the 2-minute
 * running lease, and dies holding it. Nothing heartbeats it, so
 * `turns.finalizeExpired` posts the "Turn stalled" alert.
 */
describe("isDaemonClaimPaused", () => {
  test("an unset fence never pauses", () => {
    expect(isDaemonClaimPaused({ claimPausedUntil: undefined, now: NOW })).toBe(
      false,
    );
  });

  test("a future fence pauses the claim", () => {
    expect(
      isDaemonClaimPaused({ claimPausedUntil: NOW + 1_000, now: NOW }),
    ).toBe(true);
  });

  test("the fence self-expires so a crashed prewarm cannot wedge the entity", () => {
    expect(isDaemonClaimPaused({ claimPausedUntil: NOW, now: NOW })).toBe(false);
    expect(isDaemonClaimPaused({ claimPausedUntil: NOW - 1, now: NOW })).toBe(
      false,
    );
  });

  test("the TTL outlasts a kill exec but not a turn's stall deadline", () => {
    expect(DAEMON_CLAIM_PAUSE_MS).toBeGreaterThan(1_000);
    expect(DAEMON_CLAIM_PAUSE_MS).toBeLessThan(120_000);
  });
});

/**
 * Session 129: prewarm saw a stale callback bundle and killed a daemon that was
 * supervising a running background subagent (turn open, SDK silent, nothing
 * staged). The lease was orphaned and the session's backgroundAgents entries
 * stayed "running" forever.
 */
describe("shouldDeferDaemonRespawn", () => {
  test("an idle daemon with nothing staged is safe to respawn", () => {
    expect(shouldDeferDaemonRespawn(snapshot())).toBe(false);
  });

  test("an open workflow turn defers the respawn", () => {
    expect(
      shouldDeferDaemonRespawn(snapshot({ activeWorkflow: "wf_1" })),
    ).toBe(true);
  });

  test("an open synthetic turn defers the respawn", () => {
    expect(
      shouldDeferDaemonRespawn(
        snapshot({ syntheticTurnMessageId: "msg_1" }),
      ),
    ).toBe(true);
  });

  test("a staged pendingTurn always wins over the deferral", () => {
    // Deferring here would hang the turn: a doomed daemon exits for respawn
    // (stale bundle) or mismatch-polls (wrong model) instead of claiming it.
    expect(
      shouldDeferDaemonRespawn(
        snapshot({ pendingTurnStaged: true, activeWorkflow: "wf_1" }),
      ),
    ).toBe(false);
    expect(
      shouldDeferDaemonRespawn(snapshot({ pendingTurnStaged: true })),
    ).toBe(false);
  });
});

describe("every prewarm kill runs behind the claim fence", () => {
  const prewarm = functionBody(
    executionSource,
    "async function runPrewarmEntityDaemon(",
  );

  test("the daemon is only killed from inside withClaimPaused", () => {
    const kills = prewarm.match(/await killDaemon\(\)/g) ?? [];
    expect(kills.length, "both the stale and optsmismatch kills").toBe(2);
    expect(
      prewarm.includes("buildKillEntityDaemonCmd"),
      "the kill command is built in one place",
    ).toBe(true);
    // Every kill site sits inside a withClaimPaused callback.
    for (const [index] of [...prewarm.matchAll(/await killDaemon\(\)/g)].map(
      (match) => [match.index ?? -1],
    )) {
      const fenceAt = prewarm.lastIndexOf("await withClaimPaused(", index);
      expect(fenceAt, "a kill outside the fence reopens the claim race").toBeGreaterThan(-1);
      expect(
        prewarm.indexOf("await killDaemon()", fenceAt),
        "the fence must open before the kill",
      ).toBeLessThanOrEqual(index);
    }
  });

  test("the fence is set before the turn state is read, and always cleared", () => {
    const fence = prewarm.slice(
      prewarm.indexOf("const withClaimPaused = async ("),
      prewarm.indexOf("const readTurnSnapshot = async ("),
    );
    expect(fence).toContain("internal.sandboxDaemon.setDaemonClaimPause");
    const setAt = fence.indexOf("await setPause(true)");
    const clearAt = fence.indexOf("await setPause(false)");
    expect(setAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(setAt);
    expect(fence.slice(setAt, clearAt)).toContain("} finally {");
    // Pausing before the snapshot read makes the read authoritative: no claim
    // can land between the decision to kill and the process dying.
    const pauseAt = prewarm.indexOf("await withClaimPaused(");
    expect(prewarm.indexOf("await readTurnSnapshot()", pauseAt)).toBeGreaterThan(
      pauseAt,
    );
  });

  test("the stale-callback path defers mid-turn instead of killing", () => {
    const staleAt = prewarm.indexOf('aliveState === "stale"');
    const uploadAt = prewarm.indexOf("uploadCallbackScriptBundle", staleAt);
    const deferAt = prewarm.indexOf(
      "stale callback script but mid-turn — deferring respawn",
      staleAt,
    );
    const killAt = prewarm.indexOf("await killDaemon()", staleAt);
    expect(uploadAt).toBeGreaterThan(staleAt);
    expect(
      deferAt,
      "session 129: a mid-turn stale-script kill orphaned the running lease",
    ).toBeGreaterThan(uploadAt);
    expect(deferAt).toBeLessThan(killAt);
    expect(
      prewarm.slice(deferAt, killAt),
      "the deferral must return to the caller, not fall through to launch",
    ).toContain("return { prewarmed: false }");
  });

  test("the pause mutation covers every surface prewarm can kill", () => {
    const mutation = functionBody(
      source("../convex/_sandbox_runtime/daemonEntitySnapshot.ts"),
      "export const setDaemonClaimPause = internalMutation({",
    );
    // The session chat fence is patched straight onto the chat row the daemon
    // polls — there is no mirror row to keep in step.
    expect(mutation).toContain('normalizeId("sessionChats"');
    expect(mutation).toContain('normalizeId("agentTasks"');
    expect(mutation).toContain('normalizeId("projects"');
    expect(source("../convex/sandboxDaemon.ts")).toContain(
      "setDaemonClaimPause",
    );
  });
});

describe("claimPendingTurn honours the fence without stranding signals", () => {
  const surfaces: Array<[string, string, string]> = [
    ["session chats", "../convex/_sessions/workflow.ts", "chat"],
    ["task chat", "../convex/_chat/taskChatDaemon.ts", "task"],
    ["project chat", "../convex/_chat/projectChatDaemon.ts", "project"],
  ];

  for (const [label, path, holder] of surfaces) {
    test(`${label} gates the handoff after the cancel/stop drains`, () => {
      const body = functionBody(
        source(path),
        "export const claimPendingTurn = authMutation({",
      );
      const gateAt = body.indexOf("isDaemonClaimPaused({");
      expect(gateAt, "the pause gate is missing").toBeGreaterThan(-1);
      expect(body.slice(gateAt)).toContain(`claimPausedUntil: ${holder}.claimPausedUntil`);

      // Drains first: the daemon polls this mutation mid-turn to notice an
      // interrupt, so a pause that blocked them would strand cancel forever.
      const stopDrainAt = body.indexOf("pendingTaskStops: undefined");
      const cancelDrainAt = body.indexOf("cancelRequestedAt: undefined");
      const usageAt = body.indexOf("usageRefreshRequested =");
      expect(stopDrainAt).toBeGreaterThan(-1);
      expect(stopDrainAt).toBeLessThan(gateAt);
      expect(cancelDrainAt).toBeGreaterThan(-1);
      expect(cancelDrainAt).toBeLessThan(gateAt);
      expect(usageAt).toBeGreaterThan(-1);
      expect(usageAt).toBeLessThan(gateAt);

      // ...and the gate returns the drained signals rather than swallowing them.
      const gateReturn = body.slice(gateAt, body.indexOf("}", body.indexOf("};", gateAt)));
      expect(gateReturn).toContain("stopTaskToolUseIds");
      expect(gateReturn).toContain("cancelRequested");
      expect(gateReturn).toContain("usageRefreshRequested");
    });
  }

  test("the gate never touches pendingTurn", () => {
    const body = functionBody(
      source("../convex/_sessions/workflow.ts"),
      "export const claimPendingTurn = authMutation({",
    );
    const gateAt = body.indexOf("isDaemonClaimPaused({");
    const pendingAt = body.indexOf("if (!chat.pendingTurn)", gateAt);
    expect(
      pendingAt,
      "the fence must sit before the pendingTurn handoff",
    ).toBeGreaterThan(gateAt);
    expect(body.slice(gateAt, pendingAt)).not.toContain(
      "pendingTurn: undefined",
    );
  });

  test("the fence field is declared for every surface", () => {
    const fields = source("../convex/_validators/tableFields.ts");
    const chatDaemon = fields.slice(
      fields.indexOf("export const chatDaemonEntityFields = {"),
      fields.indexOf("export const agentTaskFields = {"),
    );
    expect(chatDaemon).toContain("claimPausedUntil: v.optional(v.number())");
    // Session chats carry the fence by spreading the shared daemon fields, so
    // the row claimPendingTurn polls is the row prewarm pauses.
    const sessionChat = fields.slice(
      fields.indexOf("export const sessionChatFields = {"),
      fields.indexOf("export const agentTaskFields = {"),
    );
    expect(sessionChat).toContain("...chatDaemonEntityFields,");
  });
});
