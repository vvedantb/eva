/**
 * One wording for the sandbox across every chat panel (session, quick task,
 * project), on the web and the phone. The header buttons already say "Wake up
 * Eva" / "Put Eva to sleep", so the transcript and the composer speak about
 * Eva too rather than about a "sandbox" the user never named.
 */
export const SANDBOX_CHAT_COPY = {
  startingTitle: "Waking Eva up…",
  stoppingTitle: "Putting Eva to sleep…",
  asleepTitle: "Eva is asleep",
  asleepDescription: "Eva's sandbox is asleep.",
  /** Sending while asleep queues the message and wakes Eva to run it. */
  asleepPlaceholder: "Send a message to wake Eva up…",
  /** The last turn hit a usage limit; sends queue until just after the reset. */
  usageLimitPlaceholder: "Usage limit reached — messages send after the reset…",
  /** Why the composer will not send while Eva sleeps. */
  asleepDisabledReason: "Wake Eva up to send",
  wakeAction: "Wake up Eva",
  switchingAccountPlaceholder: "Switching Claude account…",
  activePlaceholder: "Ask Eva anything... / for skills · @ to mention",
  /** Teaches the three composer affordances on an empty, awake chat. */
  activeDescription:
    "Type / for skills, @ to mention, or drop files to attach.",
} as const;

/**
 * Whether a sandbox chat composer accepts input, where its sends go, and the
 * copy that goes with it. One rule for all three surfaces (session, quick
 * task, project):
 * - only an account swap locks the composer. A running turn, a sleeping
 *   sandbox and a usage limit all take the message into the queue instead.
 * - `queuesSends` is that queue rule for an idle chat: asleep (the queue wakes
 *   Eva and sends once she is up) or held by a usage limit on the chosen
 *   provider (it sends just after the reset). A running turn queues too, but
 *   each surface already routes that through its own `isExecuting`.
 */
export function sandboxComposerState({
  isSandboxActive,
  isSwitchingAccount,
  isExecuting,
  isUsageLimitHeld,
}: {
  isSandboxActive: boolean;
  isSwitchingAccount: boolean;
  isExecuting: boolean;
  isUsageLimitHeld: boolean;
}): {
  isInputDisabled: boolean;
  queuesSends: boolean;
  placeholder: string;
  disabledReason: string;
} {
  const isAsleep = !isSandboxActive && !isExecuting;
  const isHeld = isUsageLimitHeld && !isExecuting;
  return {
    isInputDisabled: isSwitchingAccount,
    queuesSends: isAsleep || isHeld,
    placeholder: isSwitchingAccount
      ? SANDBOX_CHAT_COPY.switchingAccountPlaceholder
      : isHeld
        ? SANDBOX_CHAT_COPY.usageLimitPlaceholder
        : isAsleep
          ? SANDBOX_CHAT_COPY.asleepPlaceholder
          : SANDBOX_CHAT_COPY.activePlaceholder,
    disabledReason: SANDBOX_CHAT_COPY.switchingAccountPlaceholder,
  };
}
