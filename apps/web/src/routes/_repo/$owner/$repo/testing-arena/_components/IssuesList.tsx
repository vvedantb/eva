"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CrossfadeIcon,
  Spinner,
  cn,
} from "@eva/ui";
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { withMutationToast } from "@/lib/utils/mutationToast";

type EvaluationReport = FunctionReturnType<
  typeof api.evaluationReports.listByDoc
>[number];
type Issue = NonNullable<EvaluationReport["issues"]>[number];

const SEVERITY_COLORS: Record<Issue["severity"], string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  low: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

/**
 * Renders a run's flagged issues as a checkbox list. Selected issues (those not
 * already converted to a task) can be turned into agent tasks — optionally
 * auto-started — mirroring the automations "actions only" flow.
 */
export function IssuesList({ report }: { report: EvaluationReport }) {
  const issues = report.issues ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const createTasks = useMutation(api.evaluationReports.createTasksFromIssues);

  const selectableIssues = issues.filter((i) => !i.taskId);
  const allSelected =
    selectableIssues.length > 0 &&
    selectableIssues.every((i) => selected.has(i.id));

  function toggleIssue(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIssues.map((i) => i.id)));
    }
  }

  async function handleCreate(autoRun: boolean) {
    if (selected.size === 0) return;
    const count = selected.size;
    setIsCreating(true);
    // Ternaries inside the `try`, and a `try`/`finally` with no `catch`, each
    // bail the React Compiler out of this whole file. See CLAUDE.md.
    const plural = count === 1 ? "" : "s";
    const successMessage = autoRun
      ? `Created and started ${count} task${plural}`
      : `Created ${count} task${plural}`;
    const errorMessage = autoRun
      ? "Couldn't create and run tasks"
      : "Couldn't create tasks";
    const toastId = autoRun ? "issues-create-run" : "issues-create-tasks";
    try {
      await withMutationToast(
        createTasks({
          reportId: report._id,
          issueIds: Array.from(selected),
          autoRun,
        }),
        successMessage,
        errorMessage,
        toastId,
      );
      setSelected(new Set());
    } catch (error) {
      setIsCreating(false);
      throw error;
    }
    setIsCreating(false);
  }

  if (issues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No issues found — the codebase matches the document.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {selectableIssues.length > 0 && (
        <div className="flex items-center gap-2 pb-1">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground">
            Select all ({selectableIssues.length})
          </span>
        </div>
      )}

      {issues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          selected={selected.has(issue.id)}
          onToggle={() => toggleIssue(issue.id)}
        />
      ))}

      {selectableIssues.length > 0 && (
        <div className="flex max-sm:flex-wrap items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || isCreating}
            onClick={() => handleCreate(false)}
          >
            {isCreating && <Spinner size="sm" />}
            Create Tasks ({selected.size})
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0 || isCreating}
            onClick={() => handleCreate(true)}
          >
            {isCreating && <Spinner size="sm" />}
            Create & Run ({selected.size})
          </Button>
        </div>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  selected,
  onToggle,
}: {
  issue: Issue;
  selected: boolean;
  onToggle: () => void;
}) {
  const { basePath } = useRepo();
  const [expanded, setExpanded] = useState(false);
  const hasTaskCreated = issue.taskId !== undefined;
  const task = useQuery(
    api.agentTasks.get,
    hasTaskCreated && issue.taskId ? { id: issue.taskId } : "skip",
  );
  const taskSegment = task ? entityPathSegment(task) : null;
  const taskUrl =
    taskSegment !== null ? `${basePath}/quick-tasks/${taskSegment}` : null;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="rounded-surface bg-muted/40 overflow-hidden"
    >
      <div className="group flex items-center gap-3 px-3 py-2.5">
        <Checkbox
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
              SEVERITY_COLORS[issue.severity],
            )}
          >
            {issue.severity}
          </span>
          <MarqueeOnHover className="min-w-0 text-sm font-medium">
            {issue.title}
          </MarqueeOnHover>
        </CollapsibleTrigger>
        {hasTaskCreated && taskUrl && (
          <a
            href={taskUrl}
            className="max-sm:hit-target inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            <IconExternalLink size={12} aria-hidden />
            Task created
          </a>
        )}
      </div>
      <CollapsibleContent className="px-3 pb-3 pl-10 space-y-2">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {issue.description}
          </p>
          {issue.filePaths && issue.filePaths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Files
              </p>
              <div className="flex flex-wrap gap-1">
                {issue.filePaths.map((fp) => (
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
          {issue.suggestedFix && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Suggested Fix
              </p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {issue.suggestedFix}
              </p>
            </div>
          )}
      </CollapsibleContent>
    </Collapsible>
  );
}
