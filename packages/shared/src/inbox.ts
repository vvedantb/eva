import type { NeedsYouGroup } from "./needsYou";
import { ownerLabel } from "./chatSourceLabel";
import { parseEvaEntityLink } from "./repoPath";
import type { Doc, Id } from "@eva/backend";
import { getNotificationAppearance } from "./notificationAppearance";
import { splitNotificationTitle } from "./notificationTitle";

/**
 * The Inbox: one list, one row for each chat, grouped by how urgent it is.
 * The backend (`inbox.list`) builds and merges the rows; web and phone group
 * and label them here, so the two apps never drift.
 */

/** The Inbox groups, in their on-screen order (most urgent first). */
export const INBOX_GROUPS = ["holding", "waiting", "new"] as const;
export type InboxGroup = (typeof INBOX_GROUPS)[number];

export const INBOX_GROUP_LABELS: Record<InboxGroup, string> = {
  holding: "Holding up work",
  waiting: "Waiting on you",
  new: "New since you looked",
};

/** What a row is: a chat (session, quick task, project or project task), or a notification about something else. */
export type InboxRowKind = "chat" | "alert";

/** The one action a row offers besides Reply and Done. */
export type InboxAction = "answer" | "review" | "retry";

/**
 * A Needs you row's Inbox group. A blocking question or a failed run stops
 * the work, so it is Holding up work; a PR to review, or a notification that
 * asks for you in a chat (an @mention, Eva's answer), waits on you.
 */
export function inboxGroupForNeedsYou(
  group: NeedsYouGroup,
  fromNotification: boolean,
): InboxGroup {
  if (fromNotification || group === "review") return "waiting";
  return "holding";
}

/** A Needs you row's action: Answer a question, Review a PR, Retry a failed task. */
export function inboxActionForNeedsYou(row: {
  group: NeedsYouGroup;
  prUrl?: string;
  taskId?: string;
}): InboxAction | undefined {
  if (row.group === "question") return "answer";
  if (row.group === "review") return row.prUrl ? "review" : undefined;
  return row.taskId !== undefined ? "retry" : undefined;
}

/** The fields merging reads. */
export type MergeableInboxRow = {
  /** The chat the row is about (its owner entity id), or the notification for an alert. */
  key: string;
  group: InboxGroup;
  kind: InboxRowKind;
  at: number;
  preview?: string;
};

/**
 * One row for each chat, in its most urgent group. When a chat has several
 * rows (a question and a PR, or new messages and a notification about it),
 * the most urgent group wins, a chat row beats an alert in the same group,
 * and the newest wins after that. The kept row takes the newest line and time
 * of the rows it absorbed. Sorted by group, newest first.
 */
export function mergeInboxRows<Row extends MergeableInboxRow>(
  rows: readonly Row[],
): Row[] {
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    const kept = byKey.get(row.key);
    if (!kept) {
      byKey.set(row.key, row);
      continue;
    }
    const [winner, other] = ranksBefore(row, kept) ? [row, kept] : [kept, row];
    // The newest line about the chat shows on its row, whichever row won.
    byKey.set(
      row.key,
      other.at > winner.at && other.preview !== undefined
        ? { ...winner, at: other.at, preview: other.preview }
        : winner,
    );
  }
  return [...byKey.values()].sort(
    (a, b) => groupRank(a.group) - groupRank(b.group) || b.at - a.at,
  );
}

function groupRank(group: InboxGroup): number {
  return INBOX_GROUPS.indexOf(group);
}

function ranksBefore(a: MergeableInboxRow, b: MergeableInboxRow): boolean {
  const byGroup = groupRank(a.group) - groupRank(b.group);
  if (byGroup !== 0) return byGroup < 0;
  if (a.kind !== b.kind) return a.kind === "chat";
  return a.at > b.at;
}

/** Rows by group, in group order, keeping the order inside a group. Empty groups are left out. */
export function groupInboxRows<Row extends { group: InboxGroup }>(
  rows: readonly Row[],
): Array<{ group: InboxGroup; label: string; rows: Row[] }> {
  return INBOX_GROUPS.flatMap((group) => {
    const inGroup = rows.filter((row) => row.group === group);
    return inGroup.length > 0
      ? [{ group, label: INBOX_GROUP_LABELS[group], rows: inGroup }]
      : [];
  });
}

/** Longest preview line the backend sends; a row shows one line of it. */
export const INBOX_PREVIEW_LENGTH = 140;

/**
 * A message as one plain line for a row's preview: markdown marks, links and
 * code fences dropped, white space collapsed, cut at `INBOX_PREVIEW_LENGTH`.
 */
export function inboxPreview(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Line-start marks only: "#902" in a sentence is a task number, not a heading.
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > INBOX_PREVIEW_LENGTH
    ? `${plain.slice(0, INBOX_PREVIEW_LENGTH - 1).trimEnd()}…`
    : plain;
}

/** "3 new", capped: the backend counts at most `INBOX_NEW_COUNT_CAP` + 1. */
export const INBOX_NEW_COUNT_CAP = 9;

export function inboxNewCountLabel(count: number): string {
  return count > INBOX_NEW_COUNT_CAP ? `${INBOX_NEW_COUNT_CAP}+ new` : `${count} new`;
}

/** The source line above a row's title: "Checkout v2 · #902", "Checkout v2 · Eva", "Quick task #88", "Session #412". */
export function inboxContextLabel(row: {
  source: "project" | "quick_task" | "session" | "alert";
  projectTitle?: string;
  numId?: number;
  contextLabel?: string;
}): string {
  const number = row.numId !== undefined ? `#${row.numId}` : undefined;
  if (row.source === "project") {
    // No task number: the project's own chat, with Eva.
    return `${row.projectTitle ?? "Project"} · ${number ?? "Eva"}`;
  }
  if (row.source === "alert") return row.contextLabel ?? "Notification";
  return ownerLabel(row.source, row.numId);
}

/**
 * What Done acts on: a chat (`inbox.markDone`, it leaves until something newer
 * happens) or a notification (`notifications.archiveMany`). Rows in Holding up
 * work and Waiting on you that come from live state have neither: they leave
 * once someone acts on them.
 */
export type InboxDoneTarget<ChatId, NotificationId> =
  /** A chat; `notificationId` is a notification folded into its row, read on Done. */
  | { kind: "chat"; chatId: ChatId; notificationId?: NotificationId }
  | { kind: "notification"; notificationId: NotificationId };

export function inboxDoneTarget<ChatId, NotificationId>(row: {
  doneChatId?: ChatId;
  notificationId?: NotificationId;
}): InboxDoneTarget<ChatId, NotificationId> | undefined {
  if (row.doneChatId !== undefined) {
    return { kind: "chat", chatId: row.doneChatId, notificationId: row.notificationId };
  }
  if (row.notificationId !== undefined) {
    return { kind: "notification", notificationId: row.notificationId };
  }
  return undefined;
}

/** The chat an app link points at: a session, a task (quick or project), or a project's own chat. */
export type InboxChatRef =
  | { kind: "session"; numId: number }
  | { kind: "task"; numId: number }
  | { kind: "project"; numId: number };

/**
 * The chat a notification's link points at, so the Inbox folds it into that
 * chat's row: `/…/sessions/N`, `/…/quick-tasks/N`, `/…/projects/P` (Eva's
 * chat), and a project task as `/…/projects/P/T[/…]` or `/…/projects/P?task=T`.
 * Undefined for any other link.
 */
export function inboxChatRefFromHref(href: string): InboxChatRef | undefined {
  const link = parseEvaEntityLink(href, "");
  if (!link) return undefined;
  if (link.section === "sessions") return { kind: "session", numId: link.numId };
  if (link.section === "quick-tasks") return { kind: "task", numId: link.numId };
  if (link.section !== "projects") return undefined;
  const [path = "", query = ""] = href.split("#")[0]?.split("?") ?? [];
  const segments = path.split("/");
  const after = segments[segments.indexOf("projects") + 2];
  const taskText =
    after !== undefined && /^\d+$/.test(after)
      ? after
      : new URLSearchParams(query).get("task") ?? undefined;
  return taskText !== undefined && /^\d+$/.test(taskText)
    ? { kind: "task", numId: Number(taskText) }
    : { kind: "project", numId: link.numId };
}

/**
 * A notification as a History row (the Inbox's whole feed, read and Done ones
 * too), in the same shape as an Inbox row so both lists draw it the same way.
 * Done shows only while it is not archived yet.
 */
export function inboxHistoryRow(n: Doc<"notifications">): {
  key: string;
  group: "new";
  kind: "alert";
  contextLabel: string;
  title: string;
  preview: string | undefined;
  at: number;
  unread: boolean;
  notificationId: Id<"notifications"> | undefined;
  href: string | undefined;
  chatTarget: string | undefined;
  threadRootId: Id<"messages"> | undefined;
  repoId: Id<"githubRepos"> | undefined;
  notice: { type: Doc<"notifications">["type"]; title: string; message: string | undefined };
} {
  const { subject, event } = splitNotificationTitle(n);
  return {
    key: `notification:${n._id}`,
    group: "new",
    kind: "alert",
    contextLabel: getNotificationAppearance(n).label,
    title: subject || n.title,
    preview: n.message ? inboxPreview(n.message) : event,
    at: n.createdAt,
    unread: !n.read,
    notificationId: n.archivedAt === undefined ? n._id : undefined,
    href: n.href,
    chatTarget: n.chatTarget,
    threadRootId: n.threadRootId,
    repoId: n.repoId,
    notice: { type: n.type, title: n.title, message: n.message },
  };
}

/** Whether `text` already opens with `lead` ("PR merged · moved to done" opens with "PR Merged"). */
function opensWith(text: string, lead: string): boolean {
  return text.toLowerCase().startsWith(lead.toLowerCase());
}

/**
 * Two parts of a row's second line, joined with `separator`, the second
 * dropped to its own text when it repeats the first: "PR Merged · PR merged ·
 * moved to done" reads "PR merged · moved to done".
 */
export function joinInboxLine(
  first: string | undefined,
  second: string | undefined,
  separator: string,
): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return opensWith(second, first) ? second : `${first}${separator}${second}`;
}
