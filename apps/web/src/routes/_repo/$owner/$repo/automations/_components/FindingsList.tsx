"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Doc } from "@eva/backend";
import { Button, Checkbox, Spinner, cn } from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import { entityPathSegment } from "@/lib/numId";
import { withMutationToast } from "@/lib/utils/mutationToast";

type AutomationRun = Doc<"automationRuns">;
type Finding = NonNullable<AutomationRun["findings"]>[number];

const SEVERITY_COLORS: Record<Finding["severity"], string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  low: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

interface FindingsListProps {
  run: AutomationRun;
  repoOwner: string;
  repoName: string;
}

export function FindingsList({ run, repoOwner, repoName }: FindingsListProps) {
  const findings = run.findings ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const createTasks = useMutation(api.automations.createTasksFromFindings);

  const selectableFindings = findings.filter((f) => !f.taskId);
  const allSelected =
    selectableFindings.length > 0 &&
    selectableFindings.every((f) => selected.has(f.id));

  function toggleFinding(id: string) {
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
      setSelected(new Set(selectableFindings.map((f) => f.id)));
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
    const toastId = autoRun ? "findings-create-run" : "findings-create-tasks";
    try {
      await withMutationToast(
        createTasks({
          runId: run._id,
          findingIds: Array.from(selected),
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

  return (
    <div className="space-y-2">
      {selectableFindings.length > 0 && (
        <div className="flex items-center gap-2 pb-1">
          <Checkbox
            className="max-sm:hit-target"
            aria-label={`Select all ${selectableFindings.length} findings`}
            checked={allSelected}
            onCheckedChange={toggleAll}
          />
          <span className="text-xs text-muted-foreground">
            Select all ({selectableFindings.length})
          </span>
        </div>
      )}

      {findings.map((finding, index) => (
        <ListEnter key={finding.id} index={index}>
          <FindingRow
            finding={finding}
            selected={selected.has(finding.id)}
            onToggle={() => toggleFinding(finding.id)}
            repoOwner={repoOwner}
            repoName={repoName}
          />
        </ListEnter>
      ))}

      {selectableFindings.length > 0 && (
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

function FindingRow({
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

  return (
    <div className={cn("rounded-surface bg-muted/40 overflow-hidden")}>
      <div className="group flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          className="max-sm:hit-target"
          aria-label={`Select finding: ${finding.title}`}
          checked={hasTaskCreated ? true : selected}
          disabled={hasTaskCreated}
          onCheckedChange={onToggle}
        />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
        >
          {expanded ? (
            <IconChevronDown
              size={14}
              className="shrink-0 text-muted-foreground"
            />
          ) : (
            <IconChevronRight
              size={14}
              className="shrink-0 text-muted-foreground"
            />
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              SEVERITY_COLORS[finding.severity],
            )}
          >
            {finding.severity}
          </span>
          <MarqueeOnHover className="min-w-0 text-sm font-medium">
            {finding.title}
          </MarqueeOnHover>
        </button>
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
      {expanded && (
        <div className="px-3 pb-3 pl-10 space-y-2">
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
        </div>
      )}
    </div>
  );
}
