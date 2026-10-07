"use client";

import { Badge, Button, cn, motionFast } from "@eva/ui";
import { m } from "motion/react";
import { IconClipboardList, IconCode } from "@tabler/icons-react";
import { proposedPlanTitle } from "./planExport";

interface ComposerPlanReadyBannerProps {
  planContent: string;
  onViewPlan: () => void;
  onApprovePlan: () => void;
  isArchived?: boolean;
  className?: string;
}

/**
 * Slim "Plan Ready" strip above the composer when a PRD exists but the compact
 * plan card is not already mounted (i.e. the sandbox pane owns the PRD tab).
 */
export function ComposerPlanReadyBanner({
  planContent,
  onViewPlan,
  onApprovePlan,
  isArchived,
  className,
}: ComposerPlanReadyBannerProps) {
  const title = proposedPlanTitle(planContent);

  return (
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
      <Badge
        variant="secondary"
        className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-semibold tracking-wide uppercase"
      >
        Plan Ready
      </Badge>
      {title ? (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Product requirements are ready to review
        </span>
      )}
      {/* Grown rather than given `hit-target`: the two buttons sit 6px apart, so
          overlapping tap extensions could send an Approve to View. */}
      <div className="flex shrink-0 items-center gap-1.5 max-sm:[&_button]:h-9">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onViewPlan}
        >
          <IconClipboardList className="size-3.5" />
          View
        </Button>
        {!isArchived ? (
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 bg-success px-2 text-xs text-success-foreground hover:bg-success/90"
            onClick={onApprovePlan}
          >
            <IconCode className="size-3.5" />
            Approve
          </Button>
        ) : null}
      </div>
    </m.div>
  );
}
