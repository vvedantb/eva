"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc } from "@eva/backend";
import { Button, Checkbox, Spinner, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { FindingRow } from "./FindingRow";
import {
  defaultSelectedIds,
  isSelected,
  overridesForClear,
  overridesForSelectAll,
  sortFindings,
  toggleOverride,
} from "./findingsTriage";

type AutomationRun = Doc<"automationRuns">;

interface FindingsListProps {
  run: AutomationRun;
  repoOwner: string;
  repoName: string;
}

export function FindingsList({ run, repoOwner, repoName }: FindingsListProps) {
  const findings = run.findings ?? [];
  /**
   * Which findings the user has flipped away from the triaged default, not
   * which are ticked. Storing the diff means a triage landing while the panel
   * is open re-ranks the list without discarding the user's clicks.
   */
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const createTasks = useMutation(api.automations.createTasksFromFindings);

  const defaults = defaultSelectedIds(findings);
  const sorted = sortFindings(findings);
  const selectableFindings = sorted.filter((f) => !f.taskId);
  const selectableIds = selectableFindings.map((f) => f.id);
  const selectedIds = selectableIds.filter((id) =>
    isSelected(id, defaults, overrides),
  );
  const allSelected =
    selectableIds.length > 0 && selectedIds.length === selectableIds.length;

  function toggleAll() {
    if (allSelected) {
      setOverrides(overridesForClear(selectableIds, defaults));
    } else {
      setOverrides(overridesForSelectAll(selectableIds, defaults));
    }
  }

  async function handleCreate(autoRun: boolean) {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
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
          findingIds: selectedIds,
          autoRun,
        }),
        successMessage,
        errorMessage,
        toastId,
      );
      // Back to the defaults, which now exclude the findings just linked.
      setOverrides(new Set());
    } catch (error) {
      setIsCreating(false);
      throw error;
    }
    setIsCreating(false);
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {selectableFindings.length > 0 ? (
          <m.div
            key="findings-select-all"
            className="flex items-center gap-2 pb-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionFast}
          >
            <Checkbox
              className="max-sm:hit-target"
              aria-label={`Select all ${selectableFindings.length} findings`}
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-muted-foreground">
              Select all ({selectableFindings.length})
            </span>
          </m.div>
        ) : null}
      </AnimatePresence>

      {sorted.map((finding, index) => (
        <ListEnter key={finding.id} index={index}>
          <FindingRow
            finding={finding}
            selected={isSelected(finding.id, defaults, overrides)}
            onToggle={() =>
              setOverrides((prev) => toggleOverride(prev, finding.id))
            }
            repoOwner={repoOwner}
            repoName={repoName}
          />
        </ListEnter>
      ))}

      <AnimatePresence initial={false}>
        {selectedIds.length > 0 ? (
          <m.div
            key="findings-bulk-bar"
            className="flex max-sm:flex-wrap items-center gap-2 pt-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionFast}
          >
            <Button
              size="sm"
              variant="outline"
              disabled={isCreating}
              onClick={() => handleCreate(false)}
            >
              {isCreating && <Spinner size="sm" />}
              Create Tasks ({selectedIds.length})
            </Button>
            <Button
              size="sm"
              disabled={isCreating}
              onClick={() => handleCreate(true)}
            >
              {isCreating && <Spinner size="sm" />}
              Create & Run ({selectedIds.length})
            </Button>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
