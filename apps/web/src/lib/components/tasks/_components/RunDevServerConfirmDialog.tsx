"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  CircleSpinner,
} from "@eva/ui";

export function RunDevServerConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isRunning,
  devCommandLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isRunning: boolean;
  devCommandLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run dev server</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            This will start the dev server again in your active sandbox. Only
            use this if you are sure the dev server is not already running—for
            example, the preview tab stays on a loading spinner indefinitely.
          </p>
          <p>
            Running it twice can cause port conflicts or duplicate processes.
          </p>
          <div className="rounded-surface bg-muted/50 px-3 py-2">
            <p className="text-xs font-medium text-foreground">Command</p>
            <p className="mt-1 font-mono text-xs break-all">
              {devCommandLabel}
            </p>
            <p className="mt-2 text-[11px]">
              From App settings (Dev server). Empty override uses auto-detection
              from package.json.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            disabled={isRunning}
          >
            {isRunning && <CircleSpinner size="sm" />}
            Run dev server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
