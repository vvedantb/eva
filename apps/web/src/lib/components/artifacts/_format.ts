import dayjs from "dayjs";
import relativeTimePlugin from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTimePlugin);

/** Human-friendly relative time for a timestamp, e.g. "2 days ago". */
export function relativeTime(ts: number): string {
  return dayjs(ts).fromNow();
}
