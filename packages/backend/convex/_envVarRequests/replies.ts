import { EVA_ENV_FILE } from "../_sandbox/vercelEnvFile";

/**
 * The chat messages an answered secret card posts back to the agent. They name
 * the key only — never the value — and tell the agent where to find it.
 */

export function savedReply(
  key: string,
  scope: "repo" | "team",
  live: boolean,
): string {
  const stored = `I saved ${key} in Eva's ${scope} env vars.`;
  return live
    ? `${stored} It is in ${EVA_ENV_FILE} now: new shells have it, and \`. ${EVA_ENV_FILE}\` loads it into an open one. Restart the dev server if it needs it.`
    : `${stored} The sandbox was not running, so it loads on the next start.`;
}

export function declinedReply(key: string): string {
  return `I declined to provide ${key}. Continue without it, or tell me what you need it for.`;
}
