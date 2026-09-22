"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@eva/ui";

/**
 * Putting the sandbox to sleep mid-turn does not cancel the turn: the daemon
 * dies with the VM, the workflow keeps waiting, and the chat sits on "Working…"
 * until the stall watchdog kills it 5–25 minutes later with an alert that blames
 * a runtime limit rather than the button that was pressed. The composer's "Stop
 * Eva" is present in exactly that window and cancels properly.
 *
 * The control used to be removed outright in that state, which read as a bug —
 * the header lost a button mid-turn and grew it back. It now stays put, inert,
 * and says why.
 */
const MID_TURN_SLEEP_HINT =
  "Eva is working — use Stop Eva in the composer first";

/**
 * The wake/sleep vocabulary for the icon-only sandbox controls, shared so the
 * session, task and project headers cannot drift apart — and so it matches the
 * status labels in `sandboxStatusStyles.ts` (Awake / Waking up / Asleep).
 */
export const SLEEP_EVA_LABEL = "Put Eva to sleep";
export const WAKE_EVA_LABEL = "Wake up Eva";
/** After a failed start the control is a retry, not a first attempt. */
export const WAKE_EVA_RETRY_LABEL = "Try waking Eva again";

/**
 * Tooltip for the icon-only sleep/wake controls: names the action (one of
 * {@link SLEEP_EVA_LABEL}, {@link WAKE_EVA_LABEL}, {@link WAKE_EVA_RETRY_LABEL}),
 * or explains the block while a turn is in flight. Always mounted so the label
 * stays reachable — these buttons carry no visible text.
 */
export function SleepControlTooltip({
  blocked,
  label,
  children,
}: {
  blocked: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        {blocked ? MID_TURN_SLEEP_HINT : label}
      </TooltipContent>
    </Tooltip>
  );
}
