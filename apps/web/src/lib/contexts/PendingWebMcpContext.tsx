"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { WebMcpDiscovery } from "@/lib/components/sandbox/previewWebMcp";

interface PendingWebMcpItem {
  readonly id: string;
  readonly discovery: WebMcpDiscovery;
}

interface PendingWebMcpValue {
  readonly items: ReadonlyArray<PendingWebMcpItem>;
  add: (discovery: WebMcpDiscovery) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const PendingWebMcpContext = createContext<PendingWebMcpValue | null>(null);

export function PendingWebMcpProvider({
  children,
  initialDiscoveries = [],
}: {
  children: ReactNode;
  initialDiscoveries?: ReadonlyArray<WebMcpDiscovery>;
}) {
  const [items, setItems] = useState<PendingWebMcpItem[]>(() =>
    initialDiscoveries.map((discovery, index) => ({
      id: `webmcp:seed:${index}`,
      discovery,
    })),
  );

  const value: PendingWebMcpValue = {
    items,
    add: (discovery) => {
      setItems((current) => [
        ...current,
        { id: `webmcp:${Date.now()}:${current.length}`, discovery },
      ]);
    },
    remove: (id) => {
      setItems((current) => current.filter((item) => item.id !== id));
    },
    clear: () => {
      setItems([]);
    },
  };

  return <PendingWebMcpContext value={value}>{children}</PendingWebMcpContext>;
}

export function usePendingWebMcp(): PendingWebMcpValue | undefined {
  return useContext(PendingWebMcpContext) ?? undefined;
}
