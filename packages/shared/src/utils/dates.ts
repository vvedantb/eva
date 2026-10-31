import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatCompactRelativeTime } from "@vvedantb/ui";

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

/** "42s" / "5m" / "3h" / "2d" / "4mo" / "1y", counted like `dayjs().diff`. */
export function compactRelativeTime(date: number | string | Date): string {
  return formatCompactRelativeTime(date, { calendar: true });
}

export default dayjs;
