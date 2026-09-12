"use client";

import { Button, cn, CrossfadeIconSlot, Spinner } from "@eva/ui";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { UsageLimitsIndicator } from "@/lib/components/usage-limits";
import { SleepControlTooltip } from "./SleepEvaButton";

/**
 * Compact play/stop control used in session, project, and task sandbox chat.
 *
 * Held open but inert while a turn is in flight, with a tooltip saying why —
 * see {@link SleepControlTooltip} for the reasoning and for the `aria-disabled`
 * treatment this shares with the header sleep button.
 */
export function SandboxStartStopButton({
  isActive,
  isToggling,
  onToggle,
  isAssistantResponding = false,
}: {
  isActive: boolean;
  isToggling: boolean;
  onToggle: (action: "start" | "stop") => void;
  /** Makes the stop affordance inert while the assistant holds the turn. */
  isAssistantResponding?: boolean;
}) {
  // Only stopping is unsafe mid-turn; a turn cannot be running on a sandbox
  // that is asleep, but if the flags ever disagree, starting stays available.
  const blockedMidTurn = isActive && isAssistantResponding;
  const label = isActive ? "Put Eva to sleep" : "Wake up Eva";

  return (
    <SleepControlTooltip blocked={blockedMidTurn} label={label}>
      <Button
        size="icon-sm"
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
 * Plan usage and start/stop for project and task sandbox chat headers — the
 * sandbox-surface counterpart of the session chat header, which carries the
 * same pair itself (so nothing is duplicated there). Collapse lives on the
 * sandbox rail.
 */
export function SandboxChatHeaderActions({
  repoId,
  isSandboxActive,
  isSandboxToggling,
  onSandboxToggle,
  isAssistantResponding = false,
  model,
  providerAccountId,
  usageAccountLabel,
}: {
  repoId: Id<"githubRepos">;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  onSandboxToggle?: (action: "start" | "stop") => void;
  isAssistantResponding?: boolean;
  model: string | null | undefined;
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  usageAccountLabel: string;
}) {
  if (!onSandboxToggle) return null;

  return (
    <div className="flex shrink-0 items-center justify-end gap-1 px-2 py-1">
      <UsageLimitsIndicator
        repoId={repoId}
        model={model}
        providerAccountId={providerAccountId}
        accountLabel={usageAccountLabel}
      />
      <SandboxStartStopButton
        isActive={isSandboxActive}
        isToggling={isSandboxToggling}
        onToggle={onSandboxToggle}
        isAssistantResponding={isAssistantResponding}
      />
    </div>
  );
}
