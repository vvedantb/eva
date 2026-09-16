import { cn, CrossfadeIcon, motionFast } from "@eva/ui";
import {
  IconCheck,
  IconChevronRight,
  IconRobot,
} from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import type { BackgroundAgentEntry } from "@eva/backend";
import {
  deriveSubagents,
  subagentTone,
  type SubagentView,
} from "@/lib/components/sandbox/agentActivity";

/**
 * What one assistant turn's sub-agent batch looks like from the timeline: how
 * many were spawned and how they are getting on. Deliberately a flat summary —
 * the Agents tab owns the roster, this row is only the doorway to it.
 */
export interface AgentSpawnSummary {
  count: number;
  working: number;
  failed: number;
  live: boolean;
}

/** Counts a roster into the flat shape the row renders. */
function summariseSubagents(
  roster: ReadonlyArray<SubagentView>,
): AgentSpawnSummary {
  let working = 0;
  let failed = 0;
  for (const agent of roster) {
    const tone = subagentTone(agent.status);
    if (tone === "active") working += 1;
    else if (tone === "danger") failed += 1;
  }
  return { count: roster.length, working, failed, live: working > 0 };
}

/**
 * Folds one message's own activity log into a spawn summary. Returns null when
 * the turn spawned nothing, which is the row's render gate.
 *
 * `backgroundAgents` is entity-wide (every sub-agent the session ever ran), so
 * it is narrowed to the ids this turn actually spawned before it is folded in —
 * otherwise every turn's row would report the whole session's roster.
 */
export function deriveAgentSpawnSummary({
  activityLog,
  streamingActivity,
  backgroundAgents,
  sandboxRunning,
}: {
  activityLog?: string;
  streamingActivity?: string;
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  sandboxRunning?: boolean;
}): AgentSpawnSummary | null {
  const spawnedHere = deriveSubagents({
    activityLogs: [activityLog],
    streamingActivity,
  });
  if (spawnedHere.length === 0) return null;

  const ownIds = new Set(spawnedHere.map((agent) => agent.toolUseId));
  const roster = deriveSubagents({
    activityLogs: [activityLog],
    streamingActivity,
    backgroundAgents: (backgroundAgents ?? []).filter((entry) =>
      ownIds.has(entry.toolUseId),
    ),
    sandboxRunning,
  });
  return summariseSubagents(roster);
}

/**
 * Slim anchored row under an assistant turn that kicked off sub-agents. Live
 * status is a snapshot, not a roster: the dot never animates and the row's only
 * job is to hand the user to the Agents tab.
 */
export function AgentSpawnCtaRow({
  summary,
  onOpen,
}: {
  summary: AgentSpawnSummary;
  onOpen: () => void;
}) {
  const { count, working, failed, live } = summary;
  const plural = count === 1 ? "" : "s";
  const lead = live
    ? `Kicked off ${count} subagent${plural}`
    : `Ran ${count} subagent${plural}`;
  // One steady in-flight presentation: only settled states differentiate.
  const status = live
    ? working > 0
      ? `${working} working`
      : "working"
    : failed > 0
      ? `${failed} failed`
      : "completed";
  // Eva has no `info` colour token, so a live batch borrows `primary`.
  const dotClass = live
    ? "bg-primary"
    : failed > 0
      ? "bg-destructive"
      : "bg-success";

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionFast}
      >
        <button
          type="button"
          onClick={onOpen}
          className="motion-press mt-2 flex w-full items-center gap-2 rounded-surface border border-border bg-muted/30 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent/50 active:scale-[0.99]"
        >
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", dotClass)}
          />
          <IconRobot className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{lead}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[.7rem] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CrossfadeIcon
                show={!live && failed === 0}
                trueKey="settled"
                falseKey="live"
                variant="soft"
                className="relative flex size-3 items-center justify-center"
                whenTrue={
                  <IconCheck aria-hidden className="size-3 text-success" />
                }
                whenFalse={<span aria-hidden className="size-3" />}
              />
              {status}
            </span>
            <span className="flex items-center text-primary">
              {live ? "Open Agents" : "View"}
              <IconChevronRight aria-hidden className="size-3" />
            </span>
          </span>
        </button>
      </m.div>
    </AnimatePresence>
  );
}
