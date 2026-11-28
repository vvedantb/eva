import type { BackgroundAgentEntry } from "@eva/backend";

/** A background agent the chat lists: running, and sent to the background. */
export function isVisibleBackgroundAgent(agent: BackgroundAgentEntry): boolean {
  return agent.status === "running" && agent.backgrounded === true;
}

/** A row's title: the agent's description, or "Background agent". */
export function backgroundAgentTitle(agent: Pick<BackgroundAgentEntry, "description">): string {
  return agent.description?.trim() || "Background agent";
}

/** A row's second line: its status in words, and "backgrounded" when it was sent there. */
export function backgroundAgentStatusLine(agent: Pick<BackgroundAgentEntry, "status" | "backgrounded">): string {
  const status = agent.status.replaceAll("_", " ");
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}${agent.backgrounded ? " · backgrounded" : ""}`;
}

/** "2 agents", "1 agent": the chip's label. */
export function backgroundAgentsLabel(count: number): string {
  return `${count} ${count === 1 ? "agent" : "agents"}`;
}

/** The stop confirm: a stop cannot be undone, so it asks first. */
export function backgroundAgentStopCopy(title: string | undefined): { title: string; description: string; confirmLabel: string } {
  return {
    title: "Stop this background agent?",
    description: `${title ? `"${title}"` : "The agent"} stops before it finishes. This cannot be undone.`,
    confirmLabel: "Stop agent",
  };
}

/** The toast when a stop fails. */
export const BACKGROUND_AGENT_STOP_FAILED = "Couldn't stop background agent";
