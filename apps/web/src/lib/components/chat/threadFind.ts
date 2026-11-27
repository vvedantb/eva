export {
  collectCaseInsensitiveSubstringRanges,
  collectThreadFindDocuments,
  FIND_QUERY_MAX_LENGTH,
  findThreadMatches,
  normalizeFindQuery,
  resolveThreadFindJump,
  stepThreadFindIndex,
  threadFindCountLabel,
  type ThreadFindDocument,
  type ThreadFindMatch,
  type ThreadFindRange,
} from "@eva/shared/threadFind";

/** Cmd/Ctrl+F searches this transcript, not the whole page — unless focus is elsewhere. */
export function shouldCaptureChatFindShortcut(input: {
  readonly inChatPane: boolean;
  readonly inFindBar: boolean;
  readonly inEditable: boolean;
  readonly isDocumentRoot: boolean;
}): boolean {
  if (input.inFindBar) return true;
  if (input.inEditable) return false;
  if (input.inChatPane) return true;
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

/**
 * Escape closes the bar from anywhere in the transcript, not just from its own
 * input — the user's focus is usually still on the message they were reading.
 */
export function isWithinChatFindScope(target: EventTarget | null): boolean {
  if (typeof Element === "undefined") return false;
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      "[data-thread-find-bar], [data-chat-pane], [data-thread-find-scope]",
    ) !== null
  );
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
