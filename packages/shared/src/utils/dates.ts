import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/** Full timestamp for tooltips and detail views (matches task activity UI). */
export const EXACT_DATETIME_FORMAT = "DD/MM/YYYY HH:mm";

export function formatExactDateTime(date: number | string | Date): string {
  return dayjs(date).format(EXACT_DATETIME_FORMAT);
}

/** Today / Yesterday / weekday (this week) / full date — day section headers. */
export function formatDayLabel(date: number | string | Date): string {
  const at = dayjs(date);
  const now = dayjs();
  if (at.isSame(now, "day")) return "Today";
  if (at.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (at.isSame(now, "week")) return at.format("dddd");
  return at.format("MMMM D, YYYY");
}

export function compactRelativeTime(date: number | string | Date): string {
  const now = dayjs();
  const then = dayjs(date);
  const diffSeconds = now.diff(then, "second");

  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = now.diff(then, "minute");
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = now.diff(then, "hour");
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = now.diff(then, "day");
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = now.diff(then, "month");
  if (diffMonths < 12) return `${diffMonths}mo`;
  const diffYears = now.diff(then, "year");
  return `${diffYears}y`;
}

export default dayjs;
