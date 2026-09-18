import { tokenizedToEditable } from "@/lib/components/mentions/mentionToken";

/**
 * How many of this client's own saves to remember for the echo guard. The
 * subscription replays every server transition, so a burst of keystrokes can
 * still be arriving after the user has cleared the editor; anything in this
 * window is recognised as our own write rather than an external seed.
 */
export const ECHO_HISTORY_LIMIT = 64;

/**
 * Appends a tokenized content this client just put on the wire, dropping the
 * oldest entries so the echo window stays bounded. Newest last.
 */
export function rememberOwnSave(
  history: readonly string[],
  tokenized: string,
): string[] {
  return [...history.slice(-(ECHO_HISTORY_LIMIT - 1)), tokenized];
}

/** Why a remote draft write was left alone — one per guard, for debugging. */
type DraftPullSkipReason =
  /** Subscription has not resolved yet. */
  | "loading"
  /** Row deleted or emptied; the editor is never wiped from under the user. */
  | "cleared"
  /** This client's own write coming back around. */
  | "echo"
  /** The editor already holds exactly this text. */
  | "unchanged"
  /** Taking it would delete characters the user typed. */
  | "not-additive";

export type DraftPullDecision =
  | { apply: false; reason: DraftPullSkipReason }
  | {
      apply: true;
      displayText: string;
      mentionMap: Map<string, string>;
      skillMap: Map<string, string>;
    };

/**
 * Decides whether a `drafts` row arriving over the subscription should be
 * pushed into the mounted composer.
 *
 * Writes from outside the composer — `useSeedChatDraft`, used by the compaction
 * banner, the Approve plan action and the design-variation picker — must appear
 * live rather than only after a remount. Everything else must be ignored: the
 * editor's own saves echo back through the same subscription, and the row may
 * lag the user's latest keystroke, so applying it blindly would delete
 * characters mid-typing.
 *
 * The additive rule is what makes that safe: a write is taken only when the
 * editor is empty or when it is the editor's own text with something appended,
 * which is exactly the shape `useSeedChatDraft` writes.
 */
export function decideDraftPull(args: {
  /** `undefined` while the subscription loads, `null` when the row is gone. */
  remoteContent: string | null | undefined;
  /** The display text currently in the editor. */
  editorValue: string;
  /** Tokenized contents this client has saved, from `rememberOwnSave`. */
  ownSaves: readonly string[];
}): DraftPullDecision {
  const { remoteContent, editorValue, ownSaves } = args;
  if (remoteContent === undefined) return { apply: false, reason: "loading" };
  if (remoteContent === null || remoteContent.length === 0) {
    return { apply: false, reason: "cleared" };
  }
  if (ownSaves.includes(remoteContent)) {
    return { apply: false, reason: "echo" };
  }

  const { displayText, mentionMap, skillMap } =
    tokenizedToEditable(remoteContent);
  if (displayText === editorValue) return { apply: false, reason: "unchanged" };
  if (editorValue.trim().length !== 0 && !displayText.startsWith(editorValue)) {
    return { apply: false, reason: "not-additive" };
  }

  return { apply: true, displayText, mentionMap, skillMap };
}
