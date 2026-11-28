/** After this long with no keystroke, the person has stopped typing. */
export const TYPING_TIMEOUT_MS = 3000;

/** The presence room of a chat composer. */
export function chatTypingRoom(conversationId: string): string {
  return `typing:chat:${conversationId}`;
}

/** The presence room of a task's comment box. */
export function taskTypingRoom(taskId: string): string {
  return `typing:task:${taskId}`;
}

/** The presence room of a reply box under one comment. */
export function taskReplyTypingRoom(parentCommentId: string): string {
  return `typing:task-comment:${parentCommentId}`;
}

export interface TypingUser {
  userId: string;
  firstName: string;
}

type PresenceMember = { userId: string; online: boolean; data?: unknown };

function typingData(
  data: unknown,
): { isTyping: boolean; firstName: string } | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("isTyping" in data) || !("firstName" in data)) return null;
  const { isTyping, firstName } = data;
  return typeof isTyping === "boolean" && typeof firstName === "string"
    ? { isTyping, firstName }
    : null;
}

/** The other online members of a room whose presence data says they are typing (never `selfId`). */
export function typingUsersFrom(
  members: readonly PresenceMember[] | undefined,
  selfId: string | undefined,
): TypingUser[] {
  const users: TypingUser[] = [];
  for (const member of members ?? []) {
    if (member.userId === selfId || !member.online) continue;
    const data = typingData(member.data);
    if (data?.isTyping)
      users.push({ userId: member.userId, firstName: data.firstName });
  }
  return users;
}

/**
 * The indicator's words, as parts so the web can mark each name as personal
 * data: "Ada is typing", "Ada and Bo are typing", "Ada and 2 others are typing".
 */
export function typingLabelParts(
  users: readonly TypingUser[],
): Array<{ name: string } | { text: string }> {
  const [first = "Someone", second = "Someone"] = users.map(
    (user) => user.firstName,
  );
  if (users.length <= 1) return [{ name: first }, { text: " is typing" }];
  if (users.length === 2)
    return [
      { name: first },
      { text: " and " },
      { name: second },
      { text: " are typing" },
    ];
  return [
    { name: first },
    { text: ` and ${users.length - 1} others are typing` },
  ];
}

/**
 * The typing flag for one composer: `activity(roomId)` on each keystroke sends
 * "typing" on the rising edge only and "stopped" after `TYPING_TIMEOUT_MS` of
 * quiet; `stop()` sends "stopped" at once (on send, or leaving the screen).
 * Moving to another room stops the old one first.
 */
export function createTypingSignal(
  send: (roomId: string, isTyping: boolean) => void,
) {
  let room: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (room !== null) send(room, false);
    room = null;
  };
  const activity = (roomId: string) => {
    if (room !== roomId) {
      stop();
      room = roomId;
      send(roomId, true);
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(stop, TYPING_TIMEOUT_MS);
  };
  return { activity, stop };
}
