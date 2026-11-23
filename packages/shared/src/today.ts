import type { TodayItem } from "@eva/backend";
import dayjs from "dayjs";

/**
 * The Today page model and labels, shared by the web page and the phone
 * Today section. Only dayjs here, so the phone can load it.
 */

/** How far back Merged looks. */
const MERGED_DAYS = 7;

/**
 * `today.dashboard`'s `mergedSince`: the start of today minus seven days.
 * Rounded to a day so the query args stay the same all day (one cached
 * subscription, no window drift inside the query).
 */
export function todayMergedSince(now: number): number {
  return dayjs(now).startOf("day").subtract(MERGED_DAYS, "day").valueOf();
}

export type TodaySectionId = "needsMe" | "inProgress" | "merged";

/** The item sections, in page order. The standup Update follows them. */
const TODAY_SECTIONS: ReadonlyArray<{ id: TodaySectionId; title: string }> = [
  { id: "needsMe", title: "Needs you" },
  { id: "inProgress", title: "In progress" },
  { id: "merged", title: "Merged" },
];

/** The title over the latest Daily standup. */
export const TODAY_UPDATE_TITLE = "Update";

/** The sections that have items, in page order: an empty section is not drawn. */
export function todaySections(
  dashboard: Record<TodaySectionId, TodayItem[]>,
): Array<{ id: TodaySectionId; title: string; items: TodayItem[] }> {
  return TODAY_SECTIONS.flatMap((section) => {
    const items = dashboard[section.id];
    return items.length > 0 ? [{ ...section, items }] : [];
  });
}

/** The composer card's line: "1 needs you" / "3 need you". */
export function needsMeLabel(count: number): string {
  return `${count} ${count === 1 ? "needs" : "need"} you`;
}

/** "Today" / "Yesterday" for the two freshest entries, dates beyond that. */
export function standupEntryHeading(publishedAt: number): string {
  const published = dayjs(publishedAt);
  if (published.isSame(dayjs(), "day")) return "Today";
  if (published.isSame(dayjs().subtract(1, "day"), "day")) return "Yesterday";
  return published.format("dddd, MMM D, YYYY");
}

/** The entry's publish time beside its heading: "Nov 8, 12:04". */
export function standupEntryTime(publishedAt: number): string {
  return dayjs(publishedAt).format("MMM D, HH:mm");
}
