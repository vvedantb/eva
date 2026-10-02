/**
 * Pure decision logic for the idle-pause sweep (`sandboxIdlePause.ts`). No
 * Convex imports so the policy is unit-testable and the sweep stays a thin
 * read → decide → stop loop.
 *
 * Rule (Amp-orb style): a sandbox pauses once BOTH graces have elapsed —
 * `afterAgent` since the last agent turn finished AND `afterInteraction` since
 * the last human interaction — and nothing is busy or present right now.
 */

export type SandboxIdlePauseMode = "off" | "dry-run" | "on";

export const IDLE_PAUSE_DEFAULTS = {
  mode: "off",
  afterAgentMinutes: 5,
  afterInteractionMinutes: 20,
} as const satisfies {
  mode: SandboxIdlePauseMode;
  afterAgentMinutes: number;
  afterInteractionMinutes: number;
};

/** Minimum gap between two activity writes for one entity (OCC + write volume). */
export const ACTIVITY_TOUCH_MIN_INTERVAL_MS = 60_000;

/** True when `existing` is unset or older than the touch interval. */
export function shouldTouchActivity(
  existing: number | undefined,
  now: number,
): boolean {
  return (
    existing === undefined || now - existing >= ACTIVITY_TOUCH_MIN_INTERVAL_MS
  );
}

export interface IdleThresholds {
  mode: SandboxIdlePauseMode;
  afterAgentMs: number;
  afterInteractionMs: number;
}

/** Shape of the optional idle fields on the `appSettings` row. */
export interface IdleSettingsSource {
  sandboxIdlePauseMode?: SandboxIdlePauseMode;
  sandboxIdleAfterAgentMinutes?: number;
  sandboxIdleAfterInteractionMinutes?: number;
}

const MINUTE_MS = 60_000;

function clampMinutes(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/** Resolves the sweep thresholds from the settings row, defaulting when unset. */
export function resolveIdleThresholds(
  doc: IdleSettingsSource | null | undefined,
): IdleThresholds {
  const afterAgentMinutes = clampMinutes(
    doc?.sandboxIdleAfterAgentMinutes,
    IDLE_PAUSE_DEFAULTS.afterAgentMinutes,
  );
  const afterInteractionMinutes = clampMinutes(
    doc?.sandboxIdleAfterInteractionMinutes,
    IDLE_PAUSE_DEFAULTS.afterInteractionMinutes,
  );
  return {
    mode: doc?.sandboxIdlePauseMode ?? IDLE_PAUSE_DEFAULTS.mode,
    afterAgentMs: afterAgentMinutes * MINUTE_MS,
    afterInteractionMs: afterInteractionMinutes * MINUTE_MS,
  };
}

/**
 * Last-activity fallback for entities created before `sandboxActivity` rows
 * existed: the first defined candidate (e.g. `updatedAt`), else creation time.
 */
export function fallbackLastActivity(
  candidates: Array<number | undefined>,
  creationTime: number,
): number {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return creationTime;
}

export type IdlePauseSkipReason =
  | "off"
  | "not-active"
  | "busy"
  | "present"
  | "within-grace";

export type IdlePauseDecision =
  | { action: "pause"; idleMinutes: number }
  | { action: "skip"; reason: IdlePauseSkipReason };

export interface IdlePauseInput {
  now: number;
  mode: SandboxIdlePauseMode;
  /** Entity sandbox status: only `"active"` is eligible. */
  status: string | undefined;
  /** An agent turn / run / build is in flight or queued. */
  busy: boolean;
  /** Someone has a sandbox tab open right now (presence room). */
  present: boolean;
  lastUserActivityAt: number;
  lastAgentFinishedAt: number | undefined;
  thresholds: Pick<IdleThresholds, "afterAgentMs" | "afterInteractionMs">;
}

/** Decides whether one active sandbox should pause now. */
export function decideIdlePause(input: IdlePauseInput): IdlePauseDecision {
  if (input.mode === "off") return { action: "skip", reason: "off" };
  if (input.status !== "active") {
    return { action: "skip", reason: "not-active" };
  }
  if (input.busy) return { action: "skip", reason: "busy" };
  if (input.present) return { action: "skip", reason: "present" };

  const agentDeadline =
    (input.lastAgentFinishedAt ?? 0) + input.thresholds.afterAgentMs;
  const interactionDeadline =
    input.lastUserActivityAt + input.thresholds.afterInteractionMs;
  if (input.now < Math.max(agentDeadline, interactionDeadline)) {
    return { action: "skip", reason: "within-grace" };
  }

  const lastActivity = Math.max(
    input.lastUserActivityAt,
    input.lastAgentFinishedAt ?? 0,
  );
  return {
    action: "pause",
    idleMinutes: Math.max(0, Math.floor((input.now - lastActivity) / MINUTE_MS)),
  };
}
