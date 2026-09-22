"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CrossfadeIcon,
  cn,
} from "@eva/ui";
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import { entityPathSegment } from "@/lib/numId";
import {
  effectiveSeverity,
  isLikelyDuplicate,
  type Finding,
  type FindingSeverity,
} from "./findingsTriage";

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  low: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

export function FindingRow({
  finding,
  selected,
  onToggle,
  repoOwner,
  repoName,
}: {
  finding: Finding;
  selected: boolean;
  onToggle: () => void;
  repoOwner: string;
  repoName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTaskCreated = finding.taskId !== undefined;
  const task = useQuery(
    api.agentTasks.get,
    hasTaskCreated && finding.taskId ? { id: finding.taskId } : "skip",
  );
  const taskSegment = task ? entityPathSegment(task) : null;
  const taskUrl =
    taskSegment !== null
      ? `/${repoOwner}/${repoName}/quick-tasks/${taskSegment}`
      : null;
  const severity = effectiveSeverity(finding);
  const duplicateNumId = isLikelyDuplicate(finding)
    ? finding.triage?.duplicateOfNumId
    : undefined;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className={cn("rounded-surface bg-muted/40 overflow-hidden")}
    >
      <div className="group flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          className="max-sm:hit-target"
          aria-label={`Select finding: ${finding.title}`}
          checked={hasTaskCreated ? true : selected}
          disabled={hasTaskCreated}
          onCheckedChange={onToggle}
        />
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left min-w-0">
          <CrossfadeIcon
            show={expanded}
            whenTrue={
              <IconChevronDown size={14} className="text-muted-foreground" />
            }
            whenFalse={
              <IconChevronRight size={14} className="text-muted-foreground" />
            }
            variant="soft"
            className="relative flex size-3.5 shrink-0 items-center justify-center"
          />
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              SEVERITY_COLORS[severity],
            )}
            title={
              severity === finding.severity
                ? undefined
                : `Agent said ${finding.severity}`
            }
          >
            {severity}
          </span>
          <MarqueeOnHover className="min-w-0 text-sm font-medium">
            {finding.title}
          </MarqueeOnHover>
        </CollapsibleTrigger>
        {hasTaskCreated && taskUrl && (
          <a
            href={taskUrl}
            className="max-sm:hit-target inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
          >
            <IconExternalLink size={12} />
            Task created
          </a>
        )}
      </div>
      {/* Outside the trigger: an anchor inside a button is invalid markup. */}
      {duplicateNumId !== undefined && (
        <p className="pb-2 pl-10 pr-3 text-xs text-muted-foreground">
          Looks like task{" "}
          <a
            href={`/${repoOwner}/${repoName}/quick-tasks/${duplicateNumId}`}
            className="text-primary hover:underline"
          >
            #{duplicateNumId}
          </a>
        </p>
      )}
      <CollapsibleContent className="px-3 pb-3 pl-10 space-y-2">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap max-sm:wrap-break-word">
          {finding.description}
        </p>
        {finding.filePaths && finding.filePaths.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Files
            </p>
            <div className="flex flex-wrap gap-1">
              {finding.filePaths.map((fp) => (
                <span
                  key={fp}
                  className="inline-block max-sm:max-w-full max-sm:break-all rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                >
                  {fp}
                </span>
              ))}
            </div>
          </div>
        )}
        {finding.suggestedFix && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Suggested Fix
            </p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap max-sm:wrap-break-word">
              {finding.suggestedFix}
            </p>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
