import { formatCompactRelativeTime } from "@vvedantb/native-ui/primitives";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/**
 * "42s", "5m", "3h", "2d", "4mo", "1y", in calendar units: the web
 * `RelativeDateTime` and `compactRelativeTime` (`@eva/shared/dates`). For list rows.
 */
export function timeAgo(timestamp: number): string {
  return formatCompactRelativeTime(timestamp, { calendar: true });
}

/** "3 months ago", as the web `relativeTime` (dayjs `fromNow`). For the stash rows. */
export function fromNow(timestamp: number): string {
  return dayjs(timestamp).fromNow();
}

/** A row or header title: the stored one, or "Untitled" when it is empty or blank (the web drafts' word). */
export function displayTitle(title: string): string {
  return title.trim() || "Untitled";
}
