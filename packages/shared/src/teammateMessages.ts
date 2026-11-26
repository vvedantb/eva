/**
 * Who sent a user turn in a shared chat. The web chat and the phone chat draw
 * a teammate's turn on the left with their avatar and first name; these decide
 * which turns those are and what name to show.
 */

/** The fields of a chat message that say who sent it. */
export type ChatUserAttribution<TUserId extends string = string> = {
  role: string;
  userId?: TUserId;
  isSystemAlert?: boolean;
};

/** Teammate user turn (not yours). Missing ids → treat as own to avoid layout flash. */
export function isOtherUserChatMessage(
  message: ChatUserAttribution,
  currentUserId: string | undefined,
): boolean {
  return (
    !message.isSystemAlert &&
    message.role === "user" &&
    message.userId !== undefined &&
    currentUserId !== undefined &&
    message.userId !== currentUserId
  );
}

/** Sorted unique teammate ids that need a name lookup. Empty → skip the query. */
export function otherUserIdsInChat<TUserId extends string>(
  messages: ReadonlyArray<ChatUserAttribution<TUserId>>,
  currentUserId: TUserId | undefined,
): TUserId[] {
  const ids = new Set<TUserId>();
  for (const message of messages) {
    if (!isOtherUserChatMessage(message, currentUserId)) continue;
    if (message.userId === undefined) continue;
    ids.add(message.userId);
  }
  return [...ids].sort();
}

/** First name for chat labels; falls back to the first word of full name. */
export function firstNameFromUser(user: {
  firstName?: string | null;
  fullName?: string | null;
}): string | null {
  return user.firstName?.trim() || user.fullName?.trim().split(" ")[0] || null;
}

/** Each profile's first name by user id; a profile with no name is left out. */
export function firstNameByUserId<TUserId extends string>(
  users: ReadonlyArray<{
    _id: TUserId;
    firstName?: string | null;
    fullName?: string | null;
  }>,
): Map<TUserId, string> {
  const names = new Map<TUserId, string>();
  for (const user of users) {
    const name = firstNameFromUser(user);
    if (name) names.set(user._id, name);
  }
  return names;
}

/**
 * Who a bubble belongs to, for grouping: you, one teammate, or Eva when her
 * replies are bubbles (the project coordinator). Undefined: never groups (a
 * system row, or a flat Eva reply).
 */
function bubbleSender(
  message: ChatUserAttribution,
  currentUserId: string | undefined,
  assistantBubbles: boolean,
): string | undefined {
  if (message.isSystemAlert) return undefined;
  if (message.role === "assistant") return assistantBubbles ? "eva" : undefined;
  return isOtherUserChatMessage(message, currentUserId)
    ? `user:${message.userId}`
    : "me";
}

/**
 * Runs of bubbles from one sender, as a messaging app groups them: a row that
 * `joinsNext` drops its avatar and action row; a row that `joinsPrevious`
 * drops the sender name and sits close under the one above. A divider above a
 * row (`breaksBefore`: a new day, the "NEW" line) ends the run.
 */
export function findBubbleGroups<TId extends string>(
  messages: ReadonlyArray<ChatUserAttribution & { _id: TId }>,
  options: {
    currentUserId: string | undefined;
    assistantBubbles: boolean;
    breaksBefore: ReadonlySet<TId>;
  },
): { joinsPrevious: Set<TId>; joinsNext: Set<TId> } {
  const joinsPrevious = new Set<TId>();
  const joinsNext = new Set<TId>();
  for (let i = 1; i < messages.length; i++) {
    const previous = messages[i - 1];
    const message = messages[i];
    if (!previous || !message || options.breaksBefore.has(message._id)) {
      continue;
    }
    const sender = bubbleSender(
      message,
      options.currentUserId,
      options.assistantBubbles,
    );
    if (
      sender === undefined ||
      sender !==
        bubbleSender(previous, options.currentUserId, options.assistantBubbles)
    ) {
      continue;
    }
    joinsPrevious.add(message._id);
    joinsNext.add(previous._id);
  }
  return { joinsPrevious, joinsNext };
}
