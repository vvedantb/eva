import { IconArrowRight, IconUsers } from "@tabler/icons-react";
import { Spinner } from "@vvedantb/ui";
import type { UsageLimitHeadroom } from "@eva/shared/usageLimitRecovery";
import { USAGE_TONE_TEXT_CLASS } from "@/lib/components/usage-limits/toneClasses";
import { UsageBar } from "@/lib/components/usage-limits/UsageBar";

interface UsageLimitAccountOptionProps {
  /** The row's name, ownership and headroom (`usageLimitHeadroom`). */
  headroom: UsageLimitHeadroom;
  isTeam: boolean;
  disabled: boolean;
  inFlight: boolean;
  onSelect: () => void;
}

/**
 * One retry target, as a row you can read before you click it. The headroom
 * line is the whole point: switching to an account that is also at its limit
 * costs another failed turn, and nothing else on screen says which is which.
 */
export function UsageLimitAccountOption({
  headroom,
  isTeam,
  disabled,
  inFlight,
  onSelect,
}: UsageLimitAccountOptionProps) {
  const { name, ownership, utilization, usedLabel, tone, resetsLabel } =
    headroom;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="motion-press flex w-full items-center gap-3 rounded-surface bg-card px-3 py-2 text-left hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
        {isTeam ? <IconUsers size={14} /> : name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {name}
          {ownership ? (
            <span className="text-xs font-normal text-muted-foreground">
              {ownership}
            </span>
          ) : null}
        </span>
        {utilization === undefined ? (
          <span className="text-xs text-muted-foreground">
            {usedLabel}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <UsageBar
              utilization={utilization}
              tone={tone}
              className="w-24 shrink-0"
            />
            <span
              className={`text-xs tabular-nums ${USAGE_TONE_TEXT_CLASS[tone]}`}
            >
              {usedLabel}
            </span>
            {resetsLabel === undefined ? null : (
              <span className="truncate text-xs text-muted-foreground">
                · {resetsLabel}
              </span>
            )}
          </span>
        )}
      </span>
      {inFlight ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Spinner variant="circle" size="sm" className="size-3.5" />
          Switching…
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          Retry here
          <IconArrowRight size={14} />
        </span>
      )}
    </button>
  );
}
