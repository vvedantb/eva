import { IconArrowRight, IconLoader2, IconUsers } from "@tabler/icons-react";
import {
  formatUtilization,
  maxUtilization,
  reportedWindows,
  resetsInLabel,
  snapshotOf,
  toneForUtilization,
  USAGE_TONE_TEXT_CLASS,
  type UsageAccountEntry,
  type UsageTone,
} from "@/lib/components/usage-limits/_utils";
import { UsageBar } from "@/lib/components/usage-limits/UsageBar";

/** Utilisation at which an account is no better than the one that just failed. */
const AT_LIMIT_UTILIZATION = 95;

interface UsageLimitAccountOptionProps {
  /** First name of the account owner, or "Team". */
  name: string;
  isTeam: boolean;
  /** The viewer's own account rather than one a teammate shared. */
  isOwn: boolean;
  /** This account's usage reading, or nothing when it has never reported. */
  entry: UsageAccountEntry | undefined;
  now: number;
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
  name,
  isTeam,
  isOwn,
  entry,
  now,
  disabled,
  inFlight,
  onSelect,
}: UsageLimitAccountOptionProps) {
  const snapshot = entry === undefined ? undefined : snapshotOf(entry);
  const utilization =
    snapshot === undefined ? undefined : maxUtilization(snapshot, now);
  const tightest =
    snapshot === undefined || utilization === undefined
      ? undefined
      : reportedWindows(snapshot, now).find(
          (window) => window.utilization === utilization,
        );
  const atLimit =
    snapshot?.status === "rejected" ||
    (utilization !== undefined && utilization >= AT_LIMIT_UTILIZATION);
  const tone: UsageTone = atLimit
    ? "danger"
    : toneForUtilization(utilization ?? 0);
  const ownershipSuffix = isTeam
    ? undefined
    : isOwn
      ? " · yours"
      : " · shared with you";

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
          {isTeam ? "Team account" : name}
          {ownershipSuffix ? (
            <span className="text-xs font-normal text-muted-foreground">
              {ownershipSuffix}
            </span>
          ) : null}
        </span>
        {utilization === undefined ? (
          <span className="text-xs text-muted-foreground">
            No usage reading yet
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
              {atLimit
                ? "At limit too"
                : `${formatUtilization(utilization)} used`}
            </span>
            {tightest?.resetsAt === undefined ? null : (
              <span className="truncate text-xs text-muted-foreground">
                · {resetsInLabel(tightest.resetsAt, now)}
              </span>
            )}
          </span>
        )}
      </span>
      {inFlight ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <IconLoader2 size={14} className="animate-spin" />
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
