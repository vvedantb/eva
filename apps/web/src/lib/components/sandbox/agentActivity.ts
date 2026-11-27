import type { ActivityStep } from "@vvedantb/ui";
import type { BackgroundAgentEntry } from "@eva/backend";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";

/**
 * One sub-agent (an `Agent`/`Task` tool run), folded from the activity logs
 * the daemon already persists plus the entity's `backgroundAgents` lifecycle
 * entries. Keyed by the spawning tool_use id — the only identity both sources
 * share.
 */
export interface SubagentView {
  toolUseId: string;
  /** The prompt/description the agent was spawned with. */
  title: string;
  /** Raw lifecycle status ("running", "completed", "failed", "stale", ...). */
  status: string;
  backgrounded: boolean;
  startedAt?: number;
  settledAt?: number;
  /** The agent's transcript: steps it ran, in execution order. */
  steps: ActivityStep[];
  /** Final report from the Agent tool result, when the log captured it. */
  resultText?: string;
}

export type SubagentTone = "active" | "success" | "danger" | "muted";

/** Dot colour bucket for a lifecycle status; unknown statuses read as settled. */
export function subagentTone(status: string): SubagentTone {
  if (status === "running" || status === "pending") return "active";
  if (status === "completed") return "success";
  if (status === "failed" || status === "error" || status === "errored") {
    return "danger";
  }
  return "muted";
}

function statusFromStep(step: ActivityStep): string {
  if (step.status === "active") return "running";
  return step.isError ? "failed" : "completed";
}

function subagentTitle(step: ActivityStep): string | undefined {
  const detail = step.detail?.trim();
  if (detail) return detail;
  const label = step.label.trim();
  // The parser's placeholder labels carry no information worth showing.
  if (label && label !== "Running agent..." && label !== "Ran agent") {
    return label;
  }
  return undefined;
}

/**
 * Folds persisted message activity logs, the live streaming payload, and
 * `backgroundAgents` lifecycle entries into one roster. Order is spawn order
 * (first observation wins). Later sources refine earlier ones: streaming may
 * repeat what the last message already persisted, and lifecycle entries are
 * the status/timestamps source of truth, so overlays never duplicate an agent
 * — they merge by tool_use id.
 */
export function deriveSubagents({
  activityLogs,
  streamingActivity,
  backgroundAgents,
  sandboxRunning = true,
}: {
  /** Persisted `message.activityLog` payloads, in message order. */
  activityLogs: ReadonlyArray<string | undefined>;
  /** Live `streamingActivity.currentActivity` — pass only while a turn runs. */
  streamingActivity?: string;
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  /**
   * A sub-agent cannot outlive its sandbox, but a stop can strand entries as
   * "running" before the daemon settles them. When false, active statuses
   * read as stale instead of running forever.
   */
  sandboxRunning?: boolean;
}): SubagentView[] {
  const byId = new Map<string, SubagentView>();
  const order: string[] = [];

  const upsert = (toolUseId: string): SubagentView => {
    const existing = byId.get(toolUseId);
    if (existing) return existing;
    const created: SubagentView = {
      toolUseId,
      title: "Agent",
      status: "running",
      backgrounded: false,
      steps: [],
    };
    byId.set(toolUseId, created);
    order.push(toolUseId);
    return created;
  };

  const ingest = (steps: ActivityStep[]) => {
    const childrenByParent = new Map<string, ActivityStep[]>();
    for (const step of steps) {
      if (step.type === "subtask" && step.toolUseId) {
        const agent = upsert(step.toolUseId);
        const title = subagentTitle(step);
        if (title) agent.title = title;
        agent.status = statusFromStep(step);
        const resultText = step.output?.text.trim();
        if (resultText) agent.resultText = resultText;
      }
      const parentId = step.parentToolUseId;
      if (parentId) {
        const siblings = childrenByParent.get(parentId);
        if (siblings) siblings.push(step);
        else childrenByParent.set(parentId, [step]);
      }
    }
    for (const [parentId, kids] of childrenByParent) {
      const agent = upsert(parentId);
      // A later source repeating the same agent carries at least as many
      // steps; replacing (not appending) keeps persisted + streaming from
      // double-counting the same turn.
      if (kids.length >= agent.steps.length) agent.steps = kids;
    }
  };

  for (const log of activityLogs) {
    const steps = parseActivitySteps(log);
    if (steps) ingest(steps);
  }
  const liveSteps = parseActivitySteps(streamingActivity);
  if (liveSteps) ingest(liveSteps);

  for (const entry of backgroundAgents ?? []) {
    const agent = upsert(entry.toolUseId);
    const description = entry.description?.trim();
    if (description) agent.title = description;
    agent.status = entry.status;
    agent.backgrounded = entry.backgrounded === true;
    agent.startedAt = entry.startedAt;
    if (entry.settledAt !== undefined) agent.settledAt = entry.settledAt;
  }

  return order.flatMap((id) => {
    const agent = byId.get(id);
    if (!agent) return [];
    if (!sandboxRunning && subagentTone(agent.status) === "active") {
      return [{ ...agent, status: "stale" }];
    }
    return [agent];
  });
}
