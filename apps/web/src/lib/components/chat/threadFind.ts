export interface ThreadFindDocument {
  readonly messageId: string;
  readonly text: string;
}

export interface ThreadFindRange {
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ThreadFindMatch extends ThreadFindRange {
  readonly messageId: string;
}

export const FIND_QUERY_MAX_LENGTH = 200;

export function normalizeFindQuery(query: string): string {
  return query.trim().slice(0, FIND_QUERY_MAX_LENGTH);
}

/**
 * Non-overlapping case-insensitive substring ranges. Fast path uses lowercased
 * indexOf when case-folding preserves UTF-16 length.
 */
export function collectCaseInsensitiveSubstringRanges(
  text: string,
  query: string,
): ThreadFindRange[] {
  const needle = normalizeFindQuery(query);
  if (needle.length === 0 || text.length === 0) return [];

  const needleLower = needle.toLowerCase();
  const haystackLower = text.toLowerCase();
  if (
    haystackLower.length === text.length &&
    needleLower.length === needle.length
  ) {
    const ranges: ThreadFindRange[] = [];
    let from = 0;
    while (from <= haystackLower.length - needleLower.length) {
      const index = haystackLower.indexOf(needleLower, from);
      if (index < 0) break;
      ranges.push({ startOffset: index, endOffset: index + needle.length });
      from = index + needle.length;
    }
    return ranges;
  }

  const ranges: ThreadFindRange[] = [];
  const lastStart = text.length - needle.length;
  let from = 0;
  while (from <= lastStart) {
    if (text.slice(from, from + needle.length).toLowerCase() === needleLower) {
      ranges.push({ startOffset: from, endOffset: from + needle.length });
      from += needle.length;
      continue;
    }
    from += 1;
  }
  return ranges;
}

export function collectThreadFindDocuments(
  messages: ReadonlyArray<{
    readonly id: string;
    readonly text: string;
    readonly skip?: boolean;
  }>,
): ThreadFindDocument[] {
  const documents: ThreadFindDocument[] = [];
  for (const message of messages) {
    if (message.skip) continue;
    if (message.text.length === 0) continue;
    documents.push({ messageId: message.id, text: message.text });
  }
  return documents;
}

export function findThreadMatches(
  documents: readonly ThreadFindDocument[],
  query: string,
): ThreadFindMatch[] {
  const needle = normalizeFindQuery(query);
  if (needle.length === 0) return [];
  const matches: ThreadFindMatch[] = [];
  for (const document of documents) {
    for (const range of collectCaseInsensitiveSubstringRanges(
      document.text,
      needle,
    )) {
      matches.push({
        messageId: document.messageId,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
      });
    }
  }
  return matches;
}

export function stepThreadFindIndex(
  matchCount: number,
  currentIndex: number,
  direction: "next" | "previous",
): number {
  if (matchCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= matchCount) {
    return direction === "next" ? 0 : matchCount - 1;
  }
  if (direction === "next") return (currentIndex + 1) % matchCount;
  return (currentIndex - 1 + matchCount) % matchCount;
}

export function resolveThreadFindJump(
  matches: readonly ThreadFindMatch[],
  index: number,
): ThreadFindMatch | null {
  if (index < 0 || index >= matches.length) return null;
  return matches[index] ?? null;
}

export function threadFindCountLabel(
  query: string,
  matchCount: number,
  activeIndex: number,
): string {
  if (normalizeFindQuery(query).length === 0) return "";
  if (matchCount === 0) return "No results";
  const safe = Math.min(Math.max(activeIndex, 0), matchCount - 1);
  return `${safe + 1} / ${matchCount}`;
}

/** Cmd/Ctrl+F searches this transcript, not the whole page — unless focus is elsewhere. */
export function shouldCaptureChatFindShortcut(input: {
  readonly inChatPane: boolean;
  readonly inFindBar: boolean;
  readonly inEditable: boolean;
  readonly isDocumentRoot: boolean;
}): boolean {
  if (input.inFindBar || input.inChatPane) return true;
  if (input.inEditable) return false;
  return input.isDocumentRoot;
}

export function shouldCaptureChatFindShortcutFromTarget(
  target: EventTarget | null,
): boolean {
  if (typeof Element === "undefined") return false;
  if (!(target instanceof Element)) return true;
  return shouldCaptureChatFindShortcut({
    inChatPane: target.closest("[data-chat-pane]") !== null,
    inFindBar: target.closest("[data-thread-find-bar]") !== null,
    inEditable:
      target.closest("input, textarea, select, [contenteditable='true']") !==
      null,
    isDocumentRoot:
      target === document.body || target === document.documentElement,
  });
}

export const DEMO_THREAD_FIND_MESSAGES: ReadonlyArray<{
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
}> = [
  {
    id: "user-1",
    role: "user",
    text: "The invoices table is empty on billing.",
  },
  {
    id: "asst-1",
    role: "assistant",
    text: "I'll seed the invoices empty state and retry the invoice fetch.",
  },
  {
    id: "user-2",
    role: "user",
    text: "Also hide the upgrade banner.",
  },
];

export const DEMO_THREAD_FIND_QUERY = "invoice";
