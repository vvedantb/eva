"use client";

import { ConfirmDialog } from "@vvedantb/ui";

type TaskConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
};

/** The task and project run actions close the dialog before they start. */
function closeThen(
  onOpenChange: (open: boolean) => void,
  onConfirm: () => void,
): () => void {
  return () => {
    onOpenChange(false);
    onConfirm();
  };
}

export function StopConfirmDialog({
  onOpenChange,
  onConfirm,
  isLoading,
  ...props
}: TaskConfirmDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      size="md"
      pending={isLoading}
      onOpenChange={onOpenChange}
      onConfirm={closeThen(onOpenChange, onConfirm)}
      title="Stop Execution"
      description="This will stop the agent mid-execution. Any uncommitted progress on this run will be lost."
      confirmLabel="Stop Execution"
      variant="destructive"
    />
  );
}

export function ResolveConfirmDialog({
  onOpenChange,
  onConfirm,
  isLoading,
  ...props
}: TaskConfirmDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      size="md"
      pending={isLoading}
      onOpenChange={onOpenChange}
      onConfirm={closeThen(onOpenChange, onConfirm)}
      title="Resolve Conflicts"
      description="This will start the agent to merge the latest base branch changes and resolve any conflicts. The task will remain in code review after completion."
      confirmLabel="Resolve Conflicts"
    />
  );
}
