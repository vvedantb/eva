import type { BackgroundAgentEntry } from "../_validators/tableFields";

/**
 * Hard cap on how long one entry may block its surface's message queue. Entries
 * settle from the daemon (`settleSubagent` in callback-src), so an entry older
 * than this means the daemon died mid-run and will never report a terminal
 * status — without the cap that session's queue would stay blocked forever.
 * Matches the 2h workflow timeout used elsewhere for the same reason.
 */
export const BACKGROUND_AGENT_QUEUE_BLOCK_MS = 2 * 60 * 60 * 1000;

/**
 * Settled entries kept per surface. The array lives on a doc that the cancel,
 * finalize and drain paths each read several times in one mutation. Unbounded,
 * a long chat (700+ subagents) pushed those past Convex's 16 MB read limit.
 */
export const MAX_SETTLED_BACKGROUND_AGENTS = 50;

/** Terminal status stamped on entries orphaned by a dead daemon. */
const STALE_STATUS = "stale";

/** Terminal status stamped on an entry replaced by a restart of the same task. */
const SUPERSEDED_STATUS = "superseded";

/**
 * Merges daemon background-agent patches into the session doc array by
 * toolUseId.
 *
 * An Agent resumed via SendMessage gets a new tool_use id for the same task id.
 * The daemon that owned the first one may have died without settling it, and
 * one task cannot run twice at once, so the older running entry is superseded.
 */
export function mergeBackgroundAgents(
  existing: BackgroundAgentEntry[] | undefined,
  patches: BackgroundAgentEntry[],
): BackgroundAgentEntry[] {
  const byToolUseId = new Map<string, BackgroundAgentEntry>();
  for (const entry of existing ?? []) {
    byToolUseId.set(entry.toolUseId, entry);
  }
  for (const patch of patches) {
    const previous = byToolUseId.get(patch.toolUseId);
    byToolUseId.set(
      patch.toolUseId,
      previous ? { ...previous, ...patch } : patch,
    );
  }
  for (const patch of patches) {
    const taskId = patch.taskId;
    if (
      taskId === undefined ||
      patch.status !== "running" ||
      patch.settledAt !== undefined
    ) {
      continue;
    }
    for (const [toolUseId, entry] of byToolUseId) {
      if (
        toolUseId !== patch.toolUseId &&
        entry.taskId === taskId &&
        entry.status === "running" &&
        entry.settledAt === undefined
      ) {
        byToolUseId.set(toolUseId, {
          ...entry,
          status: SUPERSEDED_STATUS,
          settledAt: patch.startedAt,
        });
      }
    }
  }
  return pruneSettledBackgroundAgents([...byToolUseId.values()]);
}

/**
 * Keeps every unsettled entry and the most recently settled ones, in their
 * original order. Returns the same array when nothing is dropped.
 */
export function pruneSettledBackgroundAgents(
  entries: BackgroundAgentEntry[],
): BackgroundAgentEntry[] {
  const settled = entries.filter((entry) => entry.settledAt !== undefined);
  if (settled.length <= MAX_SETTLED_BACKGROUND_AGENTS) return entries;
  const kept = new Set(
    settled
      .toSorted((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
      .slice(0, MAX_SETTLED_BACKGROUND_AGENTS),
  );
  return entries.filter(
    (entry) => entry.settledAt === undefined || kept.has(entry),
  );
}

/**
 * Subagents still working: started, never settled, and recent enough to be
 * believable. A backgrounded Agent/Task outlives the turn that spawned it, so
 * this — not `activeWorkflowId` — is what says "the surface is still busy"
 * once the main turn has completed.
 */
export function runningBackgroundAgents(
  entries: BackgroundAgentEntry[] | undefined,
  now: number,
): BackgroundAgentEntry[] {
  return (entries ?? []).filter(
    (entry) =>
      entry.settledAt === undefined &&
      entry.status === "running" &&
      now - entry.startedAt < BACKGROUND_AGENT_QUEUE_BLOCK_MS,
  );
}

/**
 * When the last still-running entry ages past the cap and stops blocking the
 * queue, or `null` when nothing is running. The cap releases the gate silently
 * — no settle patch arrives — so a blocked drain uses this to come back then.
 */
export function backgroundAgentsExpireAt(
  entries: BackgroundAgentEntry[] | undefined,
  now: number,
): number | null {
  const running = runningBackgroundAgents(entries, now);
  if (running.length === 0) {
    return null;
  }
  return Math.max(
    ...running.map(
      (entry) => entry.startedAt + BACKGROUND_AGENT_QUEUE_BLOCK_MS,
    ),
  );
}

/**
 * Settles entries orphaned by a dead daemon, for callers that know no subagent
 * can still be alive (a fresh or resumed sandbox). Returns `null` when nothing
 * changed so the caller can skip the patch.
 */
export function settleOrphanedBackgroundAgents(
  entries: BackgroundAgentEntry[] | undefined,
  now: number,
): BackgroundAgentEntry[] | null {
  const orphans = (entries ?? []).filter(
    (entry) => entry.settledAt === undefined && entry.status === "running",
  );
  if (orphans.length === 0) {
    return null;
  }
  return pruneSettledBackgroundAgents(
    (entries ?? []).map((entry) =>
      orphans.includes(entry)
        ? { ...entry, status: STALE_STATUS, settledAt: now }
        : entry,
    ),
  );
}
