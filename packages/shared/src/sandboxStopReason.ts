/** Divider text for a manual or webhook sandbox stop. */
export const SANDBOX_STOPPED_ALERT = "Sandbox stopped";

const SANDBOX_PAUSED_ALERT_PREFIX = "Sandbox paused after ";
const SANDBOX_PAUSED_ALERT_SUFFIX = " min idle";

/** Divider text for an idle pause, e.g. "Sandbox paused after 25 min idle". */
export function sandboxPausedAlertText(idleMinutes: number): string {
  return `${SANDBOX_PAUSED_ALERT_PREFIX}${Math.max(0, Math.floor(idleMinutes))}${SANDBOX_PAUSED_ALERT_SUFFIX}`;
}

/** True for any divider produced by `sandboxPausedAlertText`. */
export function isSandboxPausedAlert(content: string): boolean {
  return (
    content.startsWith(SANDBOX_PAUSED_ALERT_PREFIX) &&
    content.endsWith(SANDBOX_PAUSED_ALERT_SUFFIX)
  );
}
