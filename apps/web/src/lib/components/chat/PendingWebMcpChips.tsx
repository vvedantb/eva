"use client";

import { IconPlug } from "@tabler/icons-react";
import {
  PendingContextChip,
  PendingContextChipRow,
} from "@/lib/components/chat/PendingContextChip";
import { webMcpChipLabel } from "@/lib/components/sandbox/previewWebMcp";
import { usePendingWebMcp } from "@/lib/contexts/PendingWebMcpContext";

export function PendingWebMcpChips() {
  const webmcp = usePendingWebMcp();
  if (!webmcp || webmcp.items.length === 0) return null;

  return (
    <PendingContextChipRow testId="webmcp-chips">
      {webmcp.items.map((item) => {
        const names = item.discovery.tools.map((tool) => tool.name).join(", ");
        return (
          <PendingContextChip
            key={item.id}
            icon={
              <IconPlug className="size-3.5 shrink-0 text-muted-foreground" />
            }
            label={webMcpChipLabel(item.discovery)}
            tooltip={`${item.discovery.origin}${names ? ` · ${names}` : ""}`}
            onRemove={() => webmcp.remove(item.id)}
          />
        );
      })}
    </PendingContextChipRow>
  );
}
