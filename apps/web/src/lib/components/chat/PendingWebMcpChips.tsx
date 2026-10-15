"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@eva/ui";
import { IconPlug, IconX } from "@tabler/icons-react";
import { webMcpChipLabel } from "@/lib/components/sandbox/previewWebMcp";
import { usePendingWebMcp } from "@/lib/contexts/PendingWebMcpContext";

export function PendingWebMcpChips() {
  const webmcp = usePendingWebMcp();
  if (!webmcp || webmcp.items.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" data-testid="webmcp-chips">
      {webmcp.items.map((item) => {
        const label = webMcpChipLabel(item.discovery);
        const names = item.discovery.tools.map((tool) => tool.name).join(", ");
        return (
          <Tooltip key={item.id}>
            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs text-foreground">
              <TooltipTrigger asChild>
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <IconPlug className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                </span>
              </TooltipTrigger>
              <button
                type="button"
                className="hit-target inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                aria-label={`Remove ${label}`}
                onClick={() => webmcp.remove(item.id)}
              >
                <IconX className="size-3" />
              </button>
            </span>
            <TooltipContent side="top" className="max-w-80">
              {item.discovery.origin}
              {names ? ` · ${names}` : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
