import { cn } from "@eva/ui";
import type { GitStatus } from "@pierre/trees";

const STATUS_META: Record<GitStatus, { label: string; className: string }> = {
  added: {
    label: "Added",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  modified: {
    label: "Modified",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  deleted: {
    label: "Deleted",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  renamed: {
    label: "Renamed",
    className: "border-border bg-muted text-muted-foreground",
  },
  untracked: {
    label: "Untracked",
    className: "border-border bg-muted text-muted-foreground",
  },
  ignored: {
    label: "Ignored",
    className: "border-border bg-muted text-muted-foreground",
  },
};

/**
 * GitHub-style lifecycle chip for a changed file. Ordinary modified files are
 * left unmarked, matching GitHub's file bar.
 */
export function FileStatusChip({ status }: { status: GitStatus }) {
  if (status === "modified") return null;
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded border px-1.5 py-0.5 text-3xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

type Block = "added" | "removed" | "neutral";

/**
 * GitHub's five-square change indicator. Squares are proportional once a file
 * has more than five changed lines, and any non-zero side always claims at
 * least one square so a 300/1 change still shows the deletion.
 */
function diffBlocks(additions: number, deletions: number): Block[] {
  const total = additions + deletions;
  if (total === 0) return Array.from({ length: 5 }, () => "neutral");

  const scale = total > 5 ? 5 / total : 1;
  let added = Math.round(additions * scale);
  let removed = Math.round(deletions * scale);
  if (additions > 0 && added === 0) added = 1;
  if (deletions > 0 && removed === 0) removed = 1;
  while (added + removed > 5) {
    if (added >= removed) added -= 1;
    else removed -= 1;
  }

  return [
    ...Array.from({ length: added }, (): Block => "added"),
    ...Array.from({ length: removed }, (): Block => "removed"),
    ...Array.from({ length: 5 - added - removed }, (): Block => "neutral"),
  ];
}

const BLOCK_CLASS: Record<Block, string> = {
  added: "bg-emerald-500",
  removed: "bg-destructive",
  neutral: "bg-muted-foreground/25",
};

/** `+n −m` plus the five-square indicator, as on GitHub's file bar. */
export function DiffCountBar({
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
      className={cn("flex shrink-0 items-center gap-1.5 text-xs", className)}
      title={`${additions} additions, ${deletions} deletions`}
    >
      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
        +{additions}
      </span>
      <span className="tabular-nums text-destructive">−{deletions}</span>
      <span className="flex gap-px">
        {diffBlocks(additions, deletions).map((block, index) => (
          <span
            key={index}
            className={cn("size-2 rounded-[1px]", BLOCK_CLASS[block])}
          />
        ))}
      </span>
    </span>
  );
}
