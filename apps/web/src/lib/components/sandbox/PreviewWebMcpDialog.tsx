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
  webMcpChipLabel,
  type WebMcpDiscovery,
} from "@/lib/components/sandbox/previewWebMcp";

export function PreviewWebMcpDialog({
  discovery,
  open,
  onOpenChange,
  onAddToChat,
}: {
  discovery: WebMcpDiscovery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToChat?: (discovery: WebMcpDiscovery) => void;
}) {
  if (!discovery) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="preview-webmcp-dialog">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">Page tools</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {webMcpChipLabel(discovery)} · {discovery.origin}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            Tools this preview published for the agent to call, instead of
            clicking through the page.
          </p>
          {discovery.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This page has not registered any WebMCP tools.
            </p>
          ) : (
            <ul className="space-y-3">
              {discovery.tools.map((tool) => (
                <li
                  key={tool.name}
                  className="rounded-md border border-border bg-muted/40 px-3 py-2"
                  data-testid={`webmcp-tool-${tool.name}`}
                >
                  <div className="flex items-baseline gap-2">
                    <p className="font-mono text-sm font-medium">{tool.name}</p>
                    {tool.title ? (
                      <p className="text-xs text-muted-foreground">
                        {tool.title}
                      </p>
                    ) : null}
                    {tool.readOnly ? (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        read-only
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tool.description}
                  </p>
                  <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(tool.inputSchema)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
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
              data-testid="webmcp-add-to-chat"
              disabled={discovery.tools.length === 0}
              onClick={() => {
                onAddToChat(discovery);
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
