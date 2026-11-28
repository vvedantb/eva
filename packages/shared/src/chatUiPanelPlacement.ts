export interface PlaceablePanel {
  _id: string;
  messageId?: string;
  createdAt: number;
}

/** A rendered transcript row, oldest first. */
export interface PlacementMessage {
  _id: string;
  _creationTime: number;
}

export interface PanelPlacement<Panel extends PlaceablePanel> {
  byMessageId: Map<string, Panel[]>;
  trailing: Panel[];
}

/**
 * Splits panels into "under this message" and "after everything". A panel
 * goes under its anchor message. When the anchor is not rendered (simple view
 * hides rows, or the anchor is missing), the panel goes under the newest
 * rendered row created at or before it. A panel older than the loaded window
 * waits for that history to load, so it never jumps to the end of the chat.
 */
export function placeChatUiPanels<Panel extends PlaceablePanel>(
  panels: readonly Panel[],
  messages: readonly PlacementMessage[],
  hasOlderHistory: boolean,
): PanelPlacement<Panel> {
  const ordered = [...panels].sort((a, b) => a.createdAt - b.createdAt);
  const visibleIds = new Set(messages.map((message) => message._id));
  const byMessageId = new Map<string, Panel[]>();
  const trailing: Panel[] = [];

  for (const panel of ordered) {
    const anchor =
      panel.messageId !== undefined && visibleIds.has(panel.messageId)
        ? panel.messageId
        : messages.findLast(
            (message) => message._creationTime <= panel.createdAt,
          )?._id;
    if (anchor === undefined) {
      if (!hasOlderHistory) trailing.push(panel);
      continue;
    }
    const existing = byMessageId.get(anchor);
    if (existing) existing.push(panel);
    else byMessageId.set(anchor, [panel]);
  }

  return { byMessageId, trailing };
}
