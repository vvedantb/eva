"use client";

import { cn } from "@eva/ui";

/**
 * The small pieces every review tab shares, kept in one file so the header,
 * Summary, Timeline and Code cannot each grow their own avatar or diffstat.
 */

/** `+n −m` in mono, green and red — the diffstat t3code puts on every row. */
export function PrDiffStat({
  additions,
  deletions,
  hideZero = false,
  className,
}: {
  additions: number;
  deletions: number;
  /** Drop a side that is zero, so a pure addition reads `+2`, not `+2 −0`. */
  hideZero?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 gap-1 font-mono tabular-nums", className)}
      aria-label={`${additions} additions, ${deletions} deletions`}
    >
      {hideZero && additions === 0 ? null : (
        <span className="text-emerald-600 dark:text-emerald-400">
          +{additions.toLocaleString()}
        </span>
      )}
      {hideZero && deletions === 0 ? null : (
        <span className="text-destructive">−{deletions.toLocaleString()}</span>
      )}
    </span>
  );
}

/** A GitHub avatar, or the login's first letters where GitHub sent none. */
export function PrAvatar({
  login,
  avatarUrl,
  className,
}: {
  login: string | null;
  avatarUrl: string | null;
  className?: string;
}) {
  if (avatarUrl !== null) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn("size-4 shrink-0 rounded-full bg-muted", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-medium uppercase text-muted-foreground",
        className,
      )}
    >
      {login === null ? "?" : login.slice(0, 2)}
    </span>
  );
}
