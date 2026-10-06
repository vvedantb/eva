/**
 * Pure decision logic for the idle sandbox sweep (`sandboxIdleStop.ts`).
 * Kept free of Convex imports so the rules are unit-testable in isolation.
 *
 * Vercel bills provisioned memory for every minute a sandbox runs, idle or
 * not, and nothing else stops a sandbox before its 24h session cap (or the
 * opt-in daily sweep). This is the inactivity timer that cap never was.
 */

/** Default idle threshold when the app setting has never been saved. */
export const IDLE_STOP_DEFAULT_MINUTES = 60;
/** Shortest threshold the settings mutation accepts. The sweep runs every 5 minutes, so anything below that is noise. */
export const IDLE_STOP_MIN_MINUTES = 5;
/** Longest threshold accepted — past a day the provider's own session cap stops the VM first. */
export const IDLE_STOP_MAX_MINUTES = 24 * 60;

export function isValidIdleStopMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= IDLE_STOP_MIN_MINUTES &&
    minutes <= IDLE_STOP_MAX_MINUTES
  );
}

export type IdleStopSettings = { enabled: boolean; minutes: number };

/**
 * Reads the idle sweep's settings off the (single) `appSettings` row. Absent
 * fields mean the row predates the feature: the sweep is on at the default
 * threshold, since an unbounded idle VM is the costlier mistake.
 */
export function resolveIdleStopSettings(
  doc: {
    sandboxIdleStopEnabled?: boolean;
    sandboxIdleStopMinutes?: number;
  } | null,
): IdleStopSettings {
  const minutes = doc?.sandboxIdleStopMinutes;
  return {
    enabled: doc?.sandboxIdleStopEnabled ?? true,
    minutes:
      minutes !== undefined && isValidIdleStopMinutes(minutes)
        ? minutes
        : IDLE_STOP_DEFAULT_MINUTES,
  };
}

export type IdleStopDecision = {
  stop: boolean;
  /** How long the sandbox has been idle, in ms (0 while busy). */
  idleForMs: number;
};

/**
 * Decides whether one active sandbox should be stopped for inactivity.
 *
 * Activity is chat and agent work only: `lastActivityAt` is the newest chat
 * message under the entity (a user prompt, an assistant reply, or a system
 * alert such as "Sandbox started"), and `busy` is any running turn, run or
 * build, pending handoff, or queued follow-up. Terminal or preview use that
 * never touches chat does not count — a deliberate choice so a forgotten tab
 * cannot keep a VM billing.
 */
export function idleStopDecision(args: {
  now: number;
  lastActivityAt: number;
  busy: boolean;
  idleMs: number;
}): IdleStopDecision {
  if (args.busy) return { stop: false, idleForMs: 0 };
  const idleForMs = Math.max(0, args.now - args.lastActivityAt);
  return { stop: idleForMs >= args.idleMs, idleForMs };
}

/** Chat system alert inserted just before the idle sweep stops a sandbox. */
export function idleStopAlertText(idleMinutes: number): string {
  const duration =
    idleMinutes % 60 === 0
      ? `${idleMinutes / 60} hour${idleMinutes === 60 ? "" : "s"}`
      : `${idleMinutes} minutes`;
  return `Sandbox stopped after ${duration} without activity. Send a message or press Start to resume it.`;
}
