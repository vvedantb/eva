import { cn } from "@eva/ui";
import { statusMeta } from "@/lib/components/reviews/_components/prOverviewMeta";

/**
 * One pull request as a two-line row: state glyph, title, then `#N · branch`.
 * Shared by the stack popover and every PR menu so a PR reads the same
 * wherever it is listed. Callers own the row's box (link, menu trigger).
 */
export function PrRow({
  status,
  draft,
  title,
  number,
  branch,
}: {
  status: "open" | "closed" | "merged";
  draft: boolean;
  title: string | undefined;
  number: number;
  branch: string | undefined;
}) {
  const state = statusMeta(status, draft);
  const StateIcon = state.icon;
  return (
    <>
      <StateIcon
        size={14}
        aria-label={state.label}
        className={cn("mt-0.5 shrink-0", state.textClassName)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {title ?? `Pull request #${number}`}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          #{number}
          {branch === undefined ? null : ` · ${branch}`}
        </span>
      </span>
    </>
  );
}
