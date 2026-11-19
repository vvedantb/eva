"use client";

import { cn } from "@eva/ui";
import { Button, tokenTransition } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import {
  readinessHints,
  shouldNudge,
  type DraftReadiness,
} from "./readinessHints";

interface DraftReadinessBannerProps {
  result: DraftReadiness | null;
  onDismiss: () => void;
  /** Spacing and corners for the surface it sits on; the modal and composer differ. */
  className?: string;
}

/**
 * Compact amber strip beside the draft — the quick-task description or the
 * chat composer — when it looks too vague for an agent to start on. Advisory
 * only: nothing blocks sending, and dismissing hides it for the text it was
 * judged against.
 */
export function DraftReadinessBanner({
  result,
  onDismiss,
  className,
}: DraftReadinessBannerProps) {
  const hints = result === null ? [] : readinessHints(result.missing);
  const lead = "May be too vague to run well.";
  // Built as one string: JSX would put a stray space between the sentence and
  // a conditional sibling expression.
  const message = hints.length > 0 ? `${lead} Add: ${hints.join(", ")}.` : lead;

  return (
    <AnimatePresence initial={false}>
      {shouldNudge(result) ? (
        <m.div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-surface bg-warning-bg py-1 pl-3 pr-1 text-xs leading-5 text-warning-strong",
            className,
          )}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={tokenTransition.fast}
        >
          <IconAlertTriangle aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{message}</span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Dismiss vagueness warning"
            className="shrink-0 text-warning-strong hover:bg-warning/15 hover:text-warning-strong"
            onClick={onDismiss}
            // Keep composer focus when dismissing from the input.
            onPointerDown={(event) => event.preventDefault()}
          >
            <IconX aria-hidden className="size-3" />
          </Button>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
