import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@vvedantb/ui";

interface TeamDeleteDialogProps {
  team: { id: Id<"teams">; name: string } | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function TeamDeleteDialog({
  team,
  onClose,
  onConfirm,
  isDeleting,
}: TeamDeleteDialogProps) {
  return (
    <Dialog
      open={team !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Team</DialogTitle>
        </DialogHeader>
        <div>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{team?.name}</strong>?
          </p>
          <div className="mt-3 p-3 bg-warning-bg rounded-surface">
            <p className="text-sm text-warning">
              This will permanently delete the team, remove all members, and
              unassign all codebases. Environment variables will also be
              deleted.
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
            {isDeleting ? "Deleting..." : "Delete Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
