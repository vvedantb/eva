/** Where each agent-composed panel sits in the transcript. */

export interface PlaceablePanel {
  _id: string;
  messageId?: string;
  createdAt: number;
}

export interface PanelPlacement<Panel extends PlaceablePanel> {
  /** Panels keyed by the message they render under, in creation order. */
  byMessageId: Map<string, Panel[]>;
  /**
   * Panels with no anchor, or whose anchor is not in the visible transcript
   * (simple view hides rows). They render after the last message so a panel is
   * never silently dropped.
   */
  trailing: Panel[];
}

/**
 * Splits panels into "under this message" and "after everything". Pure so the
 * placement rule can be read and tested without a transcript.
 */
export function placeChatUiPanels<Panel extends PlaceablePanel>(
  panels: readonly Panel[],
  visibleMessageIds: ReadonlySet<string>,
): PanelPlacement<Panel> {
  const ordered = [...panels].sort((a, b) => a.createdAt - b.createdAt);
  const byMessageId = new Map<string, Panel[]>();
  const trailing: Panel[] = [];

  for (const panel of ordered) {
    const anchor = panel.messageId;
    if (anchor === undefined || !visibleMessageIds.has(anchor)) {
      trailing.push(panel);
      continue;
    }
    const existing = byMessageId.get(anchor);
    if (existing) existing.push(panel);
    else byMessageId.set(anchor, [panel]);
  }

  return { byMessageId, trailing };
}
