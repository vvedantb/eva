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
  selectSnapshotForPrompt,
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
  // The review dialog is the only human control on this path, so it renders the
  // exact selection formatSnapshotPrompt sends — never a shorter preview of it.
  const selected = selectSnapshotForPrompt(snapshot);

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
              {selected.visibleText || "(empty)"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Interactive · {selected.interactiveElements.length}
            </p>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto font-mono text-xs">
              {selected.interactiveElements.map((element, index) => (
                <li key={`${index}:${element.selector}:${element.name}`}>
                  {element.role} “{element.name || "—"}”{" "}
                  <span className="text-muted-foreground">
                    {element.selector}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <details data-testid="snapshot-accessibility">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Accessibility · {selected.accessibilityTree.length}
            </summary>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto font-mono text-xs">
              {selected.accessibilityTree.length === 0 ? (
                <li className="text-muted-foreground">No nodes</li>
              ) : (
                selected.accessibilityTree.map((node, index) => (
                  <li key={`${index}:${node.role}:${node.name}`}>
                    {node.role} “{node.name || "—"}”
                  </li>
                ))
              )}
            </ul>
          </details>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Console · {selected.consoleEntries.length}
              </p>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-destructive">
                {selected.consoleEntries.length === 0 ? (
                  <li className="text-muted-foreground">No errors</li>
                ) : (
                  selected.consoleEntries.map((entry, index) => (
                    <li key={`${index}:${entry.at}:${entry.text}`}>
                      {entry.text}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Network · {selected.networkEntries.length}
              </p>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto font-mono text-xs">
                {selected.networkEntries.length === 0 ? (
                  <li className="text-muted-foreground">No failures</li>
                ) : (
                  selected.networkEntries.map((entry, index) => (
                    <li key={`${index}:${entry.at}:${entry.url}`}>
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
