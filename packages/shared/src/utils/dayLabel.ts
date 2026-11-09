import dayjs from "dayjs";

/**
 * Chat day and clock labels, shared by the web and mobile chats. Only dayjs
 * here: `./dates` also pulls in `@vvedantb/ui`, which the mobile app cannot load.
 */

/** Today / Yesterday / weekday (this week) / full date — day section headers. */
export function formatDayLabel(date: number | string | Date): string {
  const at = dayjs(date);
  const now = dayjs();
  if (at.isSame(now, "day")) return "Today";
  if (at.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (at.isSame(now, "week")) return at.format("dddd");
  return at.format("MMMM D, YYYY");
}

/** A message's clock time: "10:21 PM". */
export function formatClockTime(date: number | string | Date): string {
  return dayjs(date).format("h:mm A");
}

/**
 * Messages that open a new local calendar day, the first one included, so a
 * chat can head each day with an iMessage-style date label.
 */
export function findDayBoundaryIds<Id extends string>(
  messages: ReadonlyArray<{ _id: Id; timestamp: number }>,
): Set<Id> {
  const boundaries = new Set<Id>();
  let previousDay: string | undefined;
  for (const message of messages) {
    const day = new Date(message.timestamp).toDateString();
    if (day !== previousDay) boundaries.add(message._id);
    previousDay = day;
  }
  return boundaries;
}
