const AGENT_BROWSING_LOCK_TTL_MS = 30 * 60 * 1000;

/** True while the agent holds the desktop browser lock and it has not gone stale. */
export function isAgentBrowsingActive(
  agentBrowsingAt: number | undefined,
): boolean {
  if (agentBrowsingAt === undefined) return false;
  return Date.now() - agentBrowsingAt < AGENT_BROWSING_LOCK_TTL_MS;
}
