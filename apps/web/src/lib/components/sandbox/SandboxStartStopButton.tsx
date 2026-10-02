"use client";

import { Button, cn, CrossfadeIconSlot, Spinner } from "@eva/ui";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { UsageLimitsIndicator } from "@/lib/components/usage-limits";
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
  /** Makes the stop affordance inert while the assistant holds the turn. */
  isAssistantResponding?: boolean;
  /** The last wake attempt failed — the control offers a retry, not a start. */
  hasStartError?: boolean;
  /** Task and project footers run the larger icon button; headers stay compact. */
  size?: "sm" | "default";
}) {
  // Only stopping is unsafe mid-turn; a turn cannot be running on a sandbox
  // that is asleep, but if the flags ever disagree, starting stays available.
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
        variant={isActive ? "destructive" : "secondary"}
        onClick={() => {
          if (blockedMidTurn) return;
          onToggle(isActive ? "stop" : "start");
        }}
        disabled={isToggling}
        aria-disabled={blockedMidTurn || undefined}
        className={cn(
          isActive ? undefined : "text-success",
          blockedMidTurn &&
            "cursor-not-allowed opacity-45 hover:bg-destructive",
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

/**
 * Plan usage for project and task sandbox chat headers. Start/stop lives in the
 * task and project page headers only — one control per action, so the chat
 * header carries usage alone. Sessions keep their own start/stop in the session
 * chat header. Collapse lives on the sandbox rail.
 */
export function SandboxChatHeaderActions({
  repoId,
  model,
  providerAccountId,
  usageAccountLabel,
}: {
  repoId: Id<"githubRepos">;
  model: string | null | undefined;
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  usageAccountLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1 px-2 py-1">
      <UsageLimitsIndicator
        repoId={repoId}
        model={model}
        providerAccountId={providerAccountId}
        accountLabel={usageAccountLabel}
      />
    </div>
  );
}
