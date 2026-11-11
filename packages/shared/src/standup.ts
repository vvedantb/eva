import dayjs from "dayjs";

/**
 * The Today page labels, shared by the web page and the phone Today section.
 * Only dayjs here, so the phone can load it.
 */

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
