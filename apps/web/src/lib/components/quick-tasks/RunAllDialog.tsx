"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Spinner,
} from "@vvedantb/ui";

interface RunAllDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  ownedCount: number;
  skippedCount: number;
  onConfirm: () => void;
  isLoading: boolean;
}

export function RunAllDialog({
  isOpen,
  onOpenChange,
  ownedCount,
  skippedCount,
  onConfirm,
  isLoading,
}: RunAllDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run All Tasks</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          {ownedCount > 0 ? (
            <>
              <p>
                Eva will run and complete {ownedCount} task
                {ownedCount !== 1 && "s"} you created.
              </p>
              {skippedCount > 0 && (
                <p className="text-warning">
                  {skippedCount} task{skippedCount !== 1 && "s"} created by
                  others will be skipped. Only the task owner can run Eva.
                </p>
              )}
              <p>
                If there is an issue, Eva will return the task to To Do with a
                red border.
              </p>
              <p>If successful, she will move it to Code Review.</p>
            </>
          ) : (
            <p>
              Only the task owner can run Eva. None of the todo tasks were
              created by you.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={ownedCount === 0 || isLoading}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {isLoading && <Spinner size="sm" />}
            Run All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
