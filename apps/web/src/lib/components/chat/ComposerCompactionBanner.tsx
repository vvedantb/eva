"use client";

import { api, getAIModelProvider, type AIModel, type Id } from "@eva/backend";
import { Button, cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconArrowsDiagonalMinimize2 } from "@tabler/icons-react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useLocalStorage } from "usehooks-ts";
import { formatTokens, parseResultEvent } from "@/lib/utils/logs";

/**
 * Adopted from t3code (`CLAUDE_RESUME_COMPACTION_TOKENS`): below this occupancy
 * a resumed session is cheap enough that compacting costs more than it saves.
 */
const COMPACTION_RECOMMEND_TOKENS = 100_000;
/**
 * Adopted from t3code (`CLAUDE_RESUME_COMPACTION_MINUTES`): the gap that marks
 * the context as "an older session" rather than the turn you just watched run.
 */
const COMPACTION_RECOMMEND_IDLE_MINUTES = 70;

/** Claude harness built-in; sent verbatim as a user message. */
export const COMPACT_COMMAND = "/compact";

interface CompactionBannerState {
  /** Context occupancy of the newest completed turn. */
  usedTokens: number;
  onDismiss: () => void;
}

interface UseCompactionBannerParams {
  repoId: Id<"githubRepos">;
  /**
   * The chat's entity id as the `logs` rows carry it — `String(sessionId)`,
   * `String(taskId)` or `String(projectId)`. All three surfaces write a
   * completion log per turn, so all three can be offered the compaction.
   */
  entityId: string;
  /** The chat's current model — only Claude has `/compact`. */
  model: AIModel;
  /** A running turn owns the context; never interrupt it with an offer. */
  isExecuting: boolean;
  /** Archived, PR-terminal, or otherwise unable to send (stopped sandbox). */
  isReadOnly: boolean;
}

/**
 * Decides whether to recommend compaction on resume. All of: Claude chat,
 * newest turn left >= 100k tokens in the window, that turn finished >= 70
 * minutes ago, nothing running, and the user has not waved this turn away.
 *
 * `Date.now()` is read during render rather than ticked by a timer — Convex
 * subscriptions re-render this tree often enough, and the banner is an offer,
 * not an alarm.
 */
export function useCompactionBanner({
  repoId,
  entityId,
  model,
  isExecuting,
  isReadOnly,
}: UseCompactionBannerParams): CompactionBannerState | null {
  const [dismissedTurnAt, setDismissedTurnAt] = useLocalStorage<number | null>(
    `eva:compaction-dismissed:${entityId}`,
    null,
  );

  const isClaudeChat = getAIModelProvider(model) === "claude";
  // Non-Claude chats pay nothing for the subscription.
  const logs = useQuery(
    api.logs.getByEntityId,
    isClaudeChat && !isReadOnly ? { repoId, entityId } : "skip",
  );

  if (!isClaudeChat || isReadOnly || isExecuting) return null;

  const latest = logs?.[0];
  if (!latest) return null;

  const parsed = parseResultEvent(latest.rawResultEvent);
  // Cross-check the turn that actually ran: a session moved onto Claude after a
  // Codex run would otherwise offer to compact someone else's context.
  if (parsed.model !== "-" && !parsed.model.includes("claude")) return null;
  if (parsed.contextUsedTokens < COMPACTION_RECOMMEND_TOKENS) return null;
  if (
    Date.now() - latest.createdAt <
    COMPACTION_RECOMMEND_IDLE_MINUTES * 60_000
  ) {
    return null;
  }
  // Dismissal is keyed to the turn, so the next turn's usage re-offers.
  if (dismissedTurnAt === latest.createdAt) return null;

  return {
    usedTokens: parsed.contextUsedTokens,
    onDismiss: () => setDismissedTurnAt(latest.createdAt),
  };
}

interface ComposerCompactionBannerProps {
  usedTokens: number;
  onCompact: () => void;
  onDismiss: () => void;
  className?: string;
}

/**
 * Slim strip above the composer recommending `/compact` when the user resumes a
 * session that has been idle on a large context. Adopted from t3code.
 */
export function ComposerCompactionBanner({
  usedTokens,
  onCompact,
  onDismiss,
  className,
}: ComposerCompactionBannerProps) {
  return (
    <AnimatePresence initial={false}>
      <m.div
        className={cn(
          "mb-2 flex flex-wrap items-center gap-2 rounded-surface border border-border bg-muted/30 px-3 py-2.5",
          className,
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={motionFast}
      >
        <IconArrowsDiagonalMinimize2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-sm font-medium">
          Resume with less context
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {formatTokens(usedTokens)} tokens from an older session
        </span>
        <div className="flex shrink-0 items-center gap-1.5 max-sm:[&_button]:h-9">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onDismiss}
          >
            Keep full history
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onCompact}
          >
            <IconArrowsDiagonalMinimize2 className="size-3.5" />
            Compact
          </Button>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
