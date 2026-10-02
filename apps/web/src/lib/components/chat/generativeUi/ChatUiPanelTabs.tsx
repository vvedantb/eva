"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@eva/ui";
import type { ReactNode } from "react";

interface ChatUiPanelTabsProps {
  /** The turn's agent-composed panel(s), shown by default. */
  panel: ReactNode;
  /** The turn's prose reply, which the panel is a restatement of. */
  text: ReactNode;
}

/**
 * A turn that composed a panel says the same thing twice — once as the card,
 * once as the prose that introduced it. Showing both stacked doubles the turn's
 * height and makes the reader diff two renderings of one answer, so the panel
 * takes the slot and the prose moves one click away.
 *
 * Radix owns the selection (uncontrolled) and unmounts the inactive tab, which
 * is the point: exactly one of the two is on screen.
 */
export function ChatUiPanelTabs({ panel, text }: ChatUiPanelTabsProps) {
  return (
    <Tabs defaultValue="ui">
      <TabsList size="sm" aria-label="Reply format">
        <TabsTrigger value="ui">UI</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
      </TabsList>
      <TabsContent value="ui" className="mt-2">
        <div className="flex min-w-0 flex-col gap-2">{panel}</div>
      </TabsContent>
      <TabsContent value="text" className="mt-2">
        {text}
      </TabsContent>
    </Tabs>
  );
}
