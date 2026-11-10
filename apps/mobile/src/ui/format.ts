import { formatCompactRelativeTime } from "@vvedantb/native-ui/primitives";

/**
 * "42s", "5m", "3h", "2d", "4mo", "1y", in calendar units: the web
 * `RelativeDateTime` and `compactRelativeTime` (`@eva/shared/dates`). For list rows.
 */
export function timeAgo(timestamp: number): string {
  return formatCompactRelativeTime(timestamp, { calendar: true });
}
