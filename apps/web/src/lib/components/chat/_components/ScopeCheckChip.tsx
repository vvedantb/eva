import { cn, HoverCard, HoverCardContent, HoverCardTrigger } from "@eva/ui";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import {
  formatPercent,
  hunkHeadline,
  hunkLocation,
  hunkUnrequestedProbability,
  isUnmentioned,
  scopeCheckLabel,
  scopeCheckTone,
  unmentionedHunks,
  type ScopeCheck,
  type ScopeCheckHunk,
  type ScopeCheckTone,
} from "@/lib/components/chat/_components/scopeCheckSummary";

/**
 * Opaque tint plus its darkened text partner. The earlier pairing put
 * `--warning` / `--destructive` on a 12% wash of themselves, which measures
 * around 2:1 in light mode — the score was the least readable thing in the
 * turn. The `-strong` tokens clear WCAG AA on these backgrounds in both themes.
 */
const TONE_CLASS: Record<ScopeCheckTone, string> = {
  clear: "bg-muted text-foreground",
  review: "bg-warning-bg text-warning-strong",
  flagged: "bg-destructive-bg text-destructive-strong",
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
  const unmentioned = unmentionedHunks(check).length;
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            // 10px was below the size at which these hues stay legible even
            // once the contrast is fixed, so the chip reads at 11px like the
            // hunk rows it opens.
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium leading-none tabular-nums",
            TONE_CLASS[tone],
          )}
        >
          {tone === "clear" ? (
            <IconShieldCheck size={12} stroke={2} />
          ) : (
            <IconAlertTriangle size={12} stroke={2} />
          )}
          {scopeCheckLabel(check)} · {percent}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <p className="text-xs text-foreground">
          {tone === "clear"
            ? "Jev found no changes beyond what you asked for."
            : unmentioned > 0
              ? `${unmentioned === 1 ? "One change" : `${unmentioned} changes`} you did not ask for, and the reply did not tell you about ${unmentioned === 1 ? "it" : "them"}.`
              : `Jev puts the chance this turn changed things you did not ask for at ${percent}.`}
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
  // What changed, then where — a file path and an `@@` header are unreadable
  // to the designer or PM this row exists for. The path stays as the title so
  // a developer can still get at it, and as the fallback for rows judged
  // before the plain-English pass existed.
  const silent = isUnmentioned(hunk);
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="w-full truncate text-left text-[11px] text-foreground">
          {hunkHeadline(hunk)}
        </span>
        <span className="w-full truncate text-left text-[11px] text-muted-foreground">
          {hunkLocation(hunk)}
          {silent ? " · not mentioned in the reply" : ""}
        </span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatPercent(hunkUnrequestedProbability(hunk))}
      </span>
    </>
  );
  const title = `${hunk.file} ${hunk.header}`;
  if (!onViewDiff) {
    return (
      <div className={ROW_CLASS} title={title}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={title}
      className={cn(
        ROW_CLASS,
        "motion-press hover:bg-muted active:scale-[0.99]",
      )}
      onClick={() => onViewDiff(hunk.file)}
    >
      {body}
    </button>
  );
}
