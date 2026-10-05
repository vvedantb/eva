"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "@eva/ui";
import { IconCopy } from "@tabler/icons-react";

/**
 * The small pieces every review tab shares, kept in one file so the header,
 * Summary, Timeline and Code cannot each grow their own avatar or diffstat.
 */

/** `+n −m` in mono, green and red — the diffstat t3code puts on every row. */
export function PrDiffStat({
  additions,
  deletions,
  className,
}: {
  additions: number;
  deletions: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 gap-1 font-mono tabular-nums", className)}
      aria-label={`${additions} additions, ${deletions} deletions`}
    >
      <span className="text-emerald-600 dark:text-emerald-400">
        +{additions.toLocaleString()}
      </span>
      <span className="text-destructive">−{deletions.toLocaleString()}</span>
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

/**
 * A value worth pasting somewhere else — a branch name, a checkout command —
 * that copies itself on click. Mono and muted, so it reads as data, not a button.
 */
export function PrCopyableCode({
  value,
  label,
  className,
}: {
  value: string;
  /** What was copied, for the toast: "Branch name", "Checkout command". */
  label: string;
  className?: string;
}) {
  const copy = () => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error(`Couldn't copy the ${label.toLowerCase()}`));
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "group/copy inline-flex min-w-0 items-center gap-1 rounded font-mono text-muted-foreground transition-colors hover:text-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate">{value}</span>
          <IconCopy
            size={11}
            aria-hidden
            className="shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-70 group-focus-visible/copy:opacity-70"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>Copy {label.toLowerCase()}</TooltipContent>
    </Tooltip>
  );
}

/** A row of quiet facts separated by middots, as t3code's `MetaLine`. */
export function PrMetaLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 [&>*+*]:before:pr-1.5 [&>*+*]:before:text-muted-foreground/50 [&>*+*]:before:content-['·']",
        className,
      )}
    >
      {children}
    </span>
  );
}
