"use client";

import { Button, cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  readinessHints,
  shouldNudge,
  type DraftReadiness,
} from "./readinessHints";

interface DraftReadinessBannerProps {
  result: DraftReadiness | null;
  onDismiss: () => void;
  /** Spacing for the surface it sits on; the modal and composer differ. */
  className?: string;
}

/**
 * Slim strip beside the draft — the quick-task description or the chat
 * composer — when it looks too vague for an agent to start on. Advisory only:
 * nothing blocks sending, and dismissing hides it for the text it was judged
 * against.
 */
export function DraftReadinessBanner({
  result,
  onDismiss,
  className,
}: DraftReadinessBannerProps) {
  const hints = result === null ? [] : readinessHints(result.missing);
  const lead = "This may be too vague to run well.";
  // Built as one string: JSX would put a stray space between the sentence and
  // a conditional sibling expression.
  const message = hints.length > 0 ? `${lead} Add: ${hints.join(", ")}.` : lead;

  return (
    <AnimatePresence>
      {shouldNudge(result) ? (
        <m.div
          className={cn(
            "mx-5 mb-2 flex flex-wrap items-center gap-2 rounded-surface border border-border bg-muted/30 px-3 py-2.5",
            className,
          )}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={motionFast}
        >
          <IconInfoCircle size={16} className="shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {message}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
