import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  BACKGROUND_AGENT_QUEUE_BLOCK_MS,
  backgroundAgentsExpireAt,
  runningBackgroundAgents,
  settleOrphanedBackgroundAgents,
} from "../convex/_sessions/backgroundAgents";

const testsDir = dirname(fileURLToPath(import.meta.url));

const queueHelpersSource = readFileSync(
  join(testsDir, "../convex/_queues/helpers.ts"),
  "utf8",
);

const NOW = 1_800_000_000_000;

function agent(overrides: {
  toolUseId: string;
  status?: string;
  startedAt?: number;
  settledAt?: number;
  backgrounded?: boolean;
}) {
  return {
    toolUseId: overrides.toolUseId,
    status: overrides.status ?? "running",
    startedAt: overrides.startedAt ?? NOW - 30_000,
    ...(overrides.settledAt !== undefined
      ? { settledAt: overrides.settledAt }
      : {}),
    ...(overrides.backgrounded !== undefined
      ? { backgrounded: overrides.backgrounded }
      : {}),
  };
}

/**
 * The bug: a queued message was dequeued the moment the main turn completed,
 * while a backgrounded subagent was still working. Those subagents outlive
 * their turn, so they — not `activeWorkflowId` — decide whether the surface is
 * free to start the next queued turn.
 */
test("a backgrounded subagent that has not settled still counts as running", () => {
  expect(
    runningBackgroundAgents(
      [agent({ toolUseId: "a", backgrounded: true })],
      NOW,
    ),
  ).toHaveLength(1);
});

test("settled subagents never block the queue", () => {
  expect(
    runningBackgroundAgents(
      [
        agent({ toolUseId: "a", status: "completed", settledAt: NOW - 1_000 }),
        agent({ toolUseId: "b", status: "failed", settledAt: NOW - 1_000 }),
        agent({ toolUseId: "c", status: "stale", settledAt: NOW - 1_000 }),
      ],
      NOW,
    ),
  ).toHaveLength(0);
  expect(runningBackgroundAgents(undefined, NOW)).toHaveLength(0);
});

/**
 * Entries settle from the sandbox daemon, so a daemon that dies mid-run leaves
 * one "running" forever. Without the cap that session's queue would never
 * drain again.
 */
test("an entry older than the cap stops blocking the queue", () => {
  const stale = agent({
    toolUseId: "a",
    startedAt: NOW - BACKGROUND_AGENT_QUEUE_BLOCK_MS - 1,
  });
  expect(runningBackgroundAgents([stale], NOW)).toHaveLength(0);
});

test("a fresh sandbox settles orphaned entries and leaves the rest alone", () => {
  const settled = agent({
    toolUseId: "done",
    status: "completed",
    settledAt: NOW - 5_000,
  });
  const orphan = agent({ toolUseId: "orphan" });
  const result = settleOrphanedBackgroundAgents([settled, orphan], NOW);
  expect(result).not.toBeNull();
  expect(result).toEqual([
    settled,
    { ...orphan, status: "stale", settledAt: NOW },
  ]);
  expect(runningBackgroundAgents(result ?? [], NOW)).toHaveLength(0);
  expect(settleOrphanedBackgroundAgents([settled], NOW)).toBeNull();
});

/**
 * The cap releases the gate silently, with no settle patch to hang a drain off.
 * A drain blocked by subagents books its own retry for the moment the last of
 * them ages out, so a queued message cannot sit for hours.
 */
test("backgroundAgentsExpireAt is null when nothing is running", () => {
  expect(backgroundAgentsExpireAt(undefined, NOW)).toBeNull();
  expect(backgroundAgentsExpireAt([], NOW)).toBeNull();
  expect(
    backgroundAgentsExpireAt(
      [
        agent({ toolUseId: "a", status: "completed", settledAt: NOW - 1_000 }),
        agent({ toolUseId: "b", status: "stale", settledAt: NOW - 1_000 }),
      ],
      NOW,
    ),
  ).toBeNull();
});

test("backgroundAgentsExpireAt is the latest running entry's cap", () => {
  expect(
    backgroundAgentsExpireAt(
      [
        agent({ toolUseId: "a", startedAt: NOW - 60_000 }),
        agent({ toolUseId: "b", startedAt: NOW - 10_000 }),
      ],
      NOW,
    ),
  ).toBe(NOW - 10_000 + BACKGROUND_AGENT_QUEUE_BLOCK_MS);
});

test("backgroundAgentsExpireAt ignores entries already past the cap", () => {
  expect(
    backgroundAgentsExpireAt(
      [
        agent({
          toolUseId: "expired",
          startedAt: NOW - BACKGROUND_AGENT_QUEUE_BLOCK_MS - 1,
        }),
      ],
      NOW,
    ),
  ).toBeNull();
  expect(
    backgroundAgentsExpireAt(
      [
        agent({
          toolUseId: "expired",
          startedAt: NOW - BACKGROUND_AGENT_QUEUE_BLOCK_MS - 1,
        }),
        agent({ toolUseId: "live", startedAt: NOW - 5_000 }),
      ],
      NOW,
    ),
  ).toBe(NOW - 5_000 + BACKGROUND_AGENT_QUEUE_BLOCK_MS);
});

test("a blocked dequeue books a drain for the block-cap expiry", () => {
  expect(queueHelpersSource).toContain(
    "await scheduleDrainAtBackgroundAgentExpiry(ctx, id, entity, config)",
  );
  const start = queueHelpersSource.indexOf(
    "async function scheduleDrainAtBackgroundAgentExpiry",
  );
  expect(start).toBeGreaterThan(-1);
  const end = queueHelpersSource.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  const body = queueHelpersSource.slice(start, end);
  // A workflow or synthetic turn blocking means a completion will drain.
  expect(body).toContain("if (config.hasActiveWorkflow(entity)) return;");
  expect(body).toContain("backgroundAgentsExpireAt(");
  expect(body).toContain(
    "internal._queues.helpers.drainQueueAfterBackgroundAgents",
  );
});

/**
 * The gate has to sit in the shared dequeue, or it only covers whichever of the
 * three surfaces someone remembered to patch.
 */
test("the shared dequeue gates on the busy check, not on activeWorkflowId alone", () => {
  expect(queueHelpersSource).toContain(
    "await isSurfaceBusy(ctx, entity, config)",
  );
  expect(
    queueHelpersSource,
    "isSurfaceBusy must consult still-running subagents",
  ).toContain("runningBackgroundAgents(config.backgroundAgents(entity)");
  // Every surface config must supply the accessors the gate reads. The
  // session config's entity is a `{ chat, session }` pair, and both daemon
  // fields live on the chat.
  for (const [param, holder] of [
    ["{ chat }", "chat"],
    ["project", "project"],
    ["task", "task"],
  ]) {
    expect(queueHelpersSource).toContain(
      `backgroundAgents: (${param}) => ${holder}.backgroundAgents`,
    );
    expect(queueHelpersSource).toContain(
      `syntheticTurnMessageId: (${param}) => ${holder}.syntheticTurnMessageId`,
    );
  }
});

/**
 * Session chats add a second reason to stay parked: the per-session cap on
 * concurrently running chats. The dequeue has to ask the config, since task
 * and project chats have no such limit.
 */
test("the shared dequeue also gates on the surface's capacity", () => {
  expect(queueHelpersSource).toContain(
    "if (!(await config.hasCapacity(ctx, entity))) {",
  );
  // One slot check for both the send path and the dequeue, so the cap cannot
  // drift between them.
  expect(queueHelpersSource).toContain(
    "hasCapacity: (ctx, context) => sessionChatHasFreeSlot(ctx.db, context),",
  );
  expect(
    readFileSync(
      join(testsDir, "../convex/_sessionChats/helpers.ts"),
      "utf8",
    ),
  ).toContain("siblingsRunning < MAX_PARALLEL_CHATS");
  expect(queueHelpersSource.match(/hasCapacity: async \(\) => true,/g)?.length).toBe(
    2,
  );
});
