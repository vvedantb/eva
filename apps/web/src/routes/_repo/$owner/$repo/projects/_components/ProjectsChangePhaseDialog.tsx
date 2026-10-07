"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@eva/ui";
import {
  PROJECT_PHASES,
  phaseConfig,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import { withMutationToast } from "@/lib/utils/mutationToast";

interface ProjectsChangePhaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectIds: Set<Id<"projects">>;
  onSuccess: () => void;
}

/**
 * Bulk phase change. `projects.update` patches the phase and, for a project
 * that already has a PR, mirrors the review phases onto it (draft ↔ ready ↔
 * closed) — the same thing the per-card Phase menu does, so every phase is
 * offered here too. No build or planning workflow is started by a phase change.
 */
export function ProjectsChangePhaseDialog({
  isOpen,
  onClose,
  selectedProjectIds,
  onSuccess,
}: ProjectsChangePhaseDialogProps) {
  const updateProject = useMutation(api.projects.update);
  const [selectedPhase, setSelectedPhase] = useState<ProjectPhase | "">("");
  const [isLoading, setIsLoading] = useState(false);

  const count = selectedProjectIds.size;
  const projectIds = [...selectedProjectIds];

  const handleClose = () => {
    setSelectedPhase("");
    onClose();
  };

  const handleChangePhase = async () => {
    if (!selectedPhase) return;
    setIsLoading(true);
    // Built out here: a ternary inside the `try` bails the React Compiler out
    // of this whole file. See CLAUDE.md.
    const successMessage = `Updated ${count} project${count === 1 ? "" : "s"}`;
    try {
      await withMutationToast(
        Promise.all(
          projectIds.map((id) => updateProject({ id, phase: selectedPhase })),
        ),
        successMessage,
        "Couldn't update phase",
        "projects-bulk-phase",
      );
      setSelectedPhase("");
      onSuccess();
      onClose();
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Change phase of {count} project{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            All selected projects will be moved to the chosen phase.
          </DialogDescription>
        </DialogHeader>
        <Select
          value={selectedPhase}
          onValueChange={(value) => {
            const found = PROJECT_PHASES.find((p) => p === value);
            if (found) setSelectedPhase(found);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a phase" />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_PHASES.map((phase) => (
              <SelectItem key={phase} value={phase}>
                {phaseConfig[phase].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleChangePhase}
            disabled={isLoading || !selectedPhase}
          >
            {isLoading && <Spinner size="sm" />}
            Change Phase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
