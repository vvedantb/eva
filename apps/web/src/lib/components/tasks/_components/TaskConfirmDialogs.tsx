"use client";

import { ConfirmDialog } from "@/lib/components/ui/ConfirmDialog";

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
  ...props
}: TaskConfirmDialogProps) {
  return (
    <ConfirmDialog
      {...props}
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
  ...props
}: TaskConfirmDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      onOpenChange={onOpenChange}
      onConfirm={closeThen(onOpenChange, onConfirm)}
      title="Resolve Conflicts"
      description="This will start the agent to merge the latest base branch changes and resolve any conflicts. The task will remain in code review after completion."
      confirmLabel="Resolve Conflicts"
    />
  );
}

export function StartupCommandsConfirmDialog({
  onOpenChange,
  onConfirm,
  ...props
}: TaskConfirmDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      onOpenChange={onOpenChange}
      onConfirm={closeThen(onOpenChange, onConfirm)}
      title="Run Startup Commands"
      description="This will re-run the configured startup commands in the sandbox. Any running dev services will be restarted."
      confirmLabel="Run Startup Commands"
    />
  );
}

export function RunDevServerConfirmDialog({
  onOpenChange,
  onConfirm,
  devCommandLabel,
  ...props
}: TaskConfirmDialogProps & { devCommandLabel: string }) {
  return (
    <ConfirmDialog
      {...props}
      onOpenChange={onOpenChange}
      onConfirm={closeThen(onOpenChange, onConfirm)}
      title="Run dev server"
      confirmLabel="Run dev server"
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          This will start the dev server again in your active sandbox. Only use
          this if you are sure the dev server is not already running—for
          example, the preview tab stays on a loading spinner indefinitely.
        </p>
        <p>Running it twice can cause port conflicts or duplicate processes.</p>
        <div className="rounded-surface bg-muted/50 px-3 py-2">
          <p className="text-xs font-medium text-foreground">Command</p>
          <p className="mt-1 font-mono text-xs break-all">{devCommandLabel}</p>
          <p className="mt-2 text-2xs">
            From App settings (Dev server). Empty override uses auto-detection
            from package.json.
          </p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
