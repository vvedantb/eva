import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatCompactRelativeTime } from "@vvedantb/ui";

dayjs.extend(relativeTime);

/** Full timestamp for tooltips and detail views (matches task activity UI). */
export const EXACT_DATETIME_FORMAT = "DD/MM/YYYY HH:mm";

export function formatExactDateTime(date: number | string | Date): string {
  return dayjs(date).format(EXACT_DATETIME_FORMAT);
}

export { formatClockTime, formatDayLabel } from "./dayLabel";

/** "42s" / "5m" / "3h" / "2d" / "4mo" / "1y", counted like `dayjs().diff`. */
export function compactRelativeTime(date: number | string | Date): string {
  return formatCompactRelativeTime(date, { calendar: true });
}

export default dayjs;
