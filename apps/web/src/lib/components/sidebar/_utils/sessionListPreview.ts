/** How many non-archived sessions to show before the expand control. */
const SESSION_SIDEBAR_PREVIEW_LIMIT = 3;

/**
 * Cap the non-archived session list like t3code's thread preview: show the
 * first `limit` rows when collapsed, and always keep the selected session
 * visible even if it falls past the cutoff.
 */
export function previewSessions<T extends { _id: string }>(
  sessions: T[],
  options: {
    expanded: boolean;
    selectedId: string | null;
    limit?: number;
  },
): {
  visible: T[];
  hasOverflow: boolean;
  hiddenCount: number;
} {
  const limit = options.limit ?? SESSION_SIDEBAR_PREVIEW_LIMIT;
  const hasOverflow = sessions.length > limit;

  if (!hasOverflow || options.expanded) {
    return { visible: sessions, hasOverflow, hiddenCount: 0 };
  }

  const preview = sessions.slice(0, limit);
  const previewIds = new Set(preview.map((session) => session._id));
  const selected =
    options.selectedId === null
      ? undefined
      : sessions.find((session) => session._id === options.selectedId);

  const visible =
    selected !== undefined && !previewIds.has(selected._id)
      ? [...preview, selected]
      : preview;

  return {
    visible,
    hasOverflow,
    hiddenCount: sessions.length - visible.length,
  };
}
