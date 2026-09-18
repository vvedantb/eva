import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@eva/ui";

/**
 * What is about to be deleted. One project names itself; a bulk selection can
 * only count, since the titles would not fit and add nothing to the decision.
 */
export type ProjectDeleteTarget =
  | { kind: "single"; id: Id<"projects">; title: string }
  | { kind: "bulk"; count: number };

interface ProjectDeleteDialogProps {
  target: ProjectDeleteTarget | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function ProjectDeleteDialog({
  target,
  onClose,
  onConfirm,
  isDeleting,
}: ProjectDeleteDialogProps) {
  const isBulk = target?.kind === "bulk";
  const count = target?.kind === "bulk" ? target.count : 1;
  const plural = count === 1 ? "" : "s";

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Delete ${count} Project${plural}` : "Delete Project"}
          </DialogTitle>
        </DialogHeader>
        <div>
          <p className="text-muted-foreground">
            {isBulk ? (
              <>
                Are you sure you want to delete{" "}
                <strong>
                  {count} project{plural}
                </strong>
                ?
              </>
            ) : (
              <>
                Are you sure you want to delete{" "}
                <strong>
                  {target?.kind === "single" ? target.title : ""}
                </strong>
                ?
              </>
            )}
          </p>
          <div className="mt-3 p-3 bg-warning-bg rounded-surface">
            <p className="text-sm text-warning">
              This will permanently delete the project{plural} and all
              associated tasks, agent runs, and dependencies.
            </p>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : `Delete Project${plural}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
