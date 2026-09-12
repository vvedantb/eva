"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@eva/ui";
import {
  snapshotChipLabel,
  type PreviewSnapshot,
} from "@/lib/components/sandbox/previewSnapshot";

export function PreviewSnapshotDialog({
  snapshot,
  open,
  onOpenChange,
  onAddToChat,
}: {
  snapshot: PreviewSnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToChat?: (snapshot: PreviewSnapshot) => void;
}) {
  if (!snapshot) return null;
  const consoleErrors = snapshot.consoleEntries.filter(
    (entry) => entry.level === "error" || entry.level === "warn",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="preview-snapshot-dialog">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">Page snapshot</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {snapshotChipLabel(snapshot)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Page</p>
            <p className="mt-1 text-foreground">{snapshot.title}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {snapshot.url}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Visible text
            </p>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {snapshot.visibleText || "(empty)"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Interactive · {snapshot.interactiveElements.length}
            </p>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto font-mono text-xs">
              {snapshot.interactiveElements.slice(0, 20).map((element) => (
                <li key={`${element.selector}:${element.name}`}>
                  {element.role} “{element.name || "—"}”{" "}
                  <span className="text-muted-foreground">
                    {element.selector}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Console · {consoleErrors.length}
              </p>
              <ul className="mt-1 space-y-1 text-xs text-destructive">
                {consoleErrors.length === 0 ? (
                  <li className="text-muted-foreground">No errors</li>
                ) : (
                  consoleErrors.slice(0, 6).map((entry) => (
                    <li key={`${entry.at}:${entry.text}`}>{entry.text}</li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Network · {snapshot.networkEntries.length}
              </p>
              <ul className="mt-1 space-y-1 font-mono text-xs">
                {snapshot.networkEntries.length === 0 ? (
                  <li className="text-muted-foreground">No failures</li>
                ) : (
                  snapshot.networkEntries.slice(0, 6).map((entry) => (
                    <li key={`${entry.at}:${entry.url}`}>
                      {entry.status} {entry.url}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          {snapshot.screenshotDataUrl ? (
            <img
              src={snapshot.screenshotDataUrl}
              alt="Preview snapshot"
              className="max-h-48 rounded-md bg-muted object-contain"
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {onAddToChat ? (
            <Button
              type="button"
              data-testid="snapshot-add-to-chat"
              onClick={() => {
                onAddToChat(snapshot);
                onOpenChange(false);
              }}
            >
              Add to chat
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
