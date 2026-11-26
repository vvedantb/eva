"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";
import {
  MID_TURN_SLEEP_HINT,
  SLEEP_EVA_LABEL,
  WAKE_EVA_LABEL,
  WAKE_EVA_RETRY_LABEL,
} from "@eva/shared";

export { SLEEP_EVA_LABEL, WAKE_EVA_LABEL, WAKE_EVA_RETRY_LABEL };

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
