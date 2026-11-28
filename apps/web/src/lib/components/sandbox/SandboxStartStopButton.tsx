"use client";

import { cn } from "@eva/ui";
import { Button, CrossfadeIconSlot, Spinner } from "@vvedantb/ui";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { api } from "@eva/backend";
import { useQuery } from "convex/react";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  SleepControlTooltip,
  SLEEP_EVA_LABEL,
  WAKE_EVA_LABEL,
  WAKE_EVA_RETRY_LABEL,
} from "./SleepControlTooltip";

/**
 * Compact play/stop control: the single sandbox wake/sleep affordance, used by
 * the session chat header and by the task and project page headers. One
 * component so the two directions cannot drift apart — a header that only knows
 * how to stop leaves a slept sandbox with no way back.
 *
 * Held open but inert while a turn is in flight, with a tooltip saying why —
 * see {@link SleepControlTooltip} for the reasoning and for the `aria-disabled`
 * treatment.
 */
export function SandboxStartStopButton({
  isActive,
  isToggling,
  onToggle,
  isAssistantResponding = false,
  hasStartError = false,
  size = "sm",
}: {
  isActive: boolean;
  isToggling: boolean;
  onToggle: (action: "start" | "stop") => void;
  isAssistantResponding?: boolean;
  hasStartError?: boolean;
  size?: "sm" | "default";
}) {
  const simpleView = useSimpleView();
  const idlePause = useQuery(
    api.sandboxIdlePause.getSandboxIdlePauseSettings,
    simpleView ? {} : "skip",
  );
  const autoWakes = idlePause === undefined || idlePause.mode === "on";
  if (simpleView && (isActive || (!hasStartError && autoWakes))) return null;
  const blockedMidTurn = isActive && isAssistantResponding;
  const label = isActive
    ? SLEEP_EVA_LABEL
    : hasStartError
      ? WAKE_EVA_RETRY_LABEL
      : WAKE_EVA_LABEL;

  return (
    <SleepControlTooltip blocked={blockedMidTurn} label={label}>
      <Button
        size={size === "sm" ? "icon-sm" : "icon"}
        variant="secondary"
        onClick={() => {
          if (blockedMidTurn) return;
          onToggle(isActive ? "stop" : "start");
        }}
        disabled={isToggling}
        aria-disabled={blockedMidTurn || undefined}
        className={cn(
          isActive ? "text-destructive" : "text-success",
          blockedMidTurn && "cursor-not-allowed opacity-45",
        )}
        aria-label={label}
      >
        <CrossfadeIconSlot
          iconKey={isToggling ? "loading" : isActive ? "stop" : "play"}
        >
          {isToggling ? (
            <Spinner size="sm" />
          ) : isActive ? (
            <IconPlayerStop className="w-4 h-4" />
          ) : (
            <IconPlayerPlay className="w-4 h-4" />
          )}
        </CrossfadeIconSlot>
      </Button>
    </SleepControlTooltip>
  );
}
