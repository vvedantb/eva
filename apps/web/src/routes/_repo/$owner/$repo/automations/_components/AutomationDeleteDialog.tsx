import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@vvedantb/ui";

interface AutomationDeleteDialogProps {
  automation: { id: Id<"automations">; title: string } | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function AutomationDeleteDialog({
  automation,
  onClose,
  onConfirm,
  isDeleting,
}: AutomationDeleteDialogProps) {
  return (
    <Dialog
      open={automation !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Automation</DialogTitle>
        </DialogHeader>
        <div>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{automation?.title}</strong>
            ?
          </p>
          <div className="mt-3 p-3 bg-warning-bg rounded-surface">
            <p className="text-sm text-warning">
              This will permanently delete the automation, its cron schedule,
              and all run history.
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
            {isDeleting ? "Deleting..." : "Delete Automation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
