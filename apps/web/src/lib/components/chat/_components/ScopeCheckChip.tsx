import {
  cn,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@eva/ui";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import {
  formatPercent,
  hunkUnrequestedProbability,
  scopeCheckLabel,
  scopeCheckTone,
  type ScopeCheck,
  type ScopeCheckHunk,
  type ScopeCheckTone,
} from "@/lib/components/chat/_components/scopeCheckSummary";

const TONE_CLASS: Record<ScopeCheckTone, string> = {
  clear: "bg-muted text-muted-foreground",
  review: "bg-warning/12 text-warning",
  flagged: "bg-destructive/12 text-destructive",
};

/**
 * Jev's scope verdict for one assistant turn. Always visible rather than
 * hover-revealed: the motivating case was an unrequested icon swap inside a
 * file the turn was meant to touch, which a reviewer only catches if the chip
 * is on screen without going looking for it.
 */
export function ScopeCheckChip({
  check,
  onViewDiff,
}: {
  check: ScopeCheck;
  onViewDiff?: (repoRelativePath?: string) => void;
}) {
  const tone = scopeCheckTone(check);
  const percent = formatPercent(check.unrequestedProbability);
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none",
            TONE_CLASS[tone],
          )}
        >
          {tone === "clear" ? (
            <IconShieldCheck size={11} stroke={2} />
          ) : (
            <IconAlertTriangle size={11} stroke={2} />
          )}
          {scopeCheckLabel(check)} · {percent}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <p className="text-xs text-foreground">
          {tone === "clear"
            ? "Jev found no changes beyond what you asked for."
            : `Jev thinks there is a ${percent} chance this turn changed things you did not ask for.`}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {check.judgedHunks} of {check.totalHunks} changes judged
          {check.partial ? " · diff clipped" : ""}
        </p>
        {check.flagged.length > 0 ? (
          <div className="mt-2 flex flex-col gap-0.5">
            {check.flagged.map((hunk) => (
              <FlaggedHunkRow
                key={`${hunk.file}:${hunk.header}`}
                hunk={hunk}
                onViewDiff={onViewDiff}
              />
            ))}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

const ROW_CLASS = "flex w-full items-baseline gap-2 rounded-md px-1.5 py-1";

function FlaggedHunkRow({
  hunk,
  onViewDiff,
}: {
  hunk: ScopeCheckHunk;
  onViewDiff?: (repoRelativePath?: string) => void;
}) {
  // `dir=rtl` moves the ellipsis to the head of the path, so the file name —
  // the part that identifies the hunk — survives truncation. `<bdi>` keeps the
  // path itself left-to-right; without it the RTL context reorders slashes.
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span
          dir="rtl"
          className="w-full truncate text-left font-mono text-[11px] text-foreground"
        >
          <bdi>{hunk.file}</bdi>
        </span>
        <span className="w-full truncate text-left text-[11px] text-muted-foreground">
          {hunk.header}
        </span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatPercent(hunkUnrequestedProbability(hunk))}
      </span>
    </>
  );
  if (!onViewDiff) {
    return <div className={ROW_CLASS}>{body}</div>;
  }
  return (
    <button
      type="button"
      className={cn(ROW_CLASS, "motion-press hover:bg-muted active:scale-[0.99]")}
      onClick={() => onViewDiff(hunk.file)}
    >
      {body}
    </button>
  );
}
