import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  CrossfadeIcon,
  Spinner,
} from "@eva/ui";
import { IconTrash } from "@tabler/icons-react";

export interface RemoveMemberTarget {
  /** Full name when we have one, email otherwise — whatever the row showed. */
  label: string;
  teamName: string;
}

/**
 * Removing a member is instant and silent on their side, so it is the one
 * member action that asks first. Alt-click skips this (see `requestConfirm`).
 */
export function RemoveMemberDialog({
  target,
  onClose,
  onConfirm,
  isRemoving,
}: {
  target: RemoveMemberTarget | null;
  onClose: () => void;
  onConfirm: () => void;
  isRemoving: boolean;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Remove {target?.label} from {target?.teamName}?
          </DialogTitle>
          <DialogDescription>
            They lose access to the team&apos;s repos, shared accounts and env vars
            immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isRemoving}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isRemoving}
          >
            <CrossfadeIcon
              show={isRemoving}
              trueKey="loading"
              falseKey="idle"
              variant="soft"
              className="relative flex size-3.5 items-center justify-center"
              whenTrue={<Spinner size="sm" />}
              whenFalse={<IconTrash size={14} />}
            />
            {isRemoving ? "Removing" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
