/**
 * The weekly changelog's structured shape. The changelog automation returns
 * this as JSON so the email can render cards; older runs hold plain markdown,
 * so every reader falls back to the raw text when parsing fails. Pure module:
 * safe for queries, node actions and the email templates alike.
 */
import { z } from "zod";

export const CHANGELOG_AUTOMATION_TITLE = "Eva Weekly Changelog";

export const CHANGELOG_CATEGORIES = {
  new: { heading: "✨ New Features", noun: ["new feature", "new features"] },
  faster: { heading: "⚡ Faster & Smoother", noun: ["speed-up", "speed-ups"] },
  fixes: { heading: "🐛 Bug Fixes", noun: ["fix", "fixes"] },
  improvements: {
    heading: "🛠 Improvements",
    noun: ["improvement", "improvements"],
  },
} as const;

type ChangelogCategory = keyof typeof CHANGELOG_CATEGORIES;

const CATEGORY_ORDER: ChangelogCategory[] = [
  "new",
  "faster",
  "fixes",
  "improvements",
];

const changelogItemSchema = z.object({
  category: z.enum(["new", "faster", "fixes", "improvements"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  /** App route for the "Try it" button, e.g. "/settings/sandboxes". */
  path: z.string().startsWith("/").optional(),
  /** Marks the one item shown as the week's top pick. */
  highlight: z.boolean().optional(),
});

const changelogSchema = z.object({
  items: z.array(changelogItemSchema).nonempty(),
});

export type ChangelogItem = z.infer<typeof changelogItemSchema>;
export type Changelog = z.infer<typeof changelogSchema>;

/** An item plus its position in `items`, which is its id for feedback votes. */
export interface IndexedChangelogItem {
  index: number;
  item: ChangelogItem;
}

/**
 * Parses a run summary as a structured changelog. Tolerates a ```json fence
 * around the object. Returns null for legacy markdown or invalid JSON.
 */
export function parseChangelog(content: string): Changelog | null {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(content.trim());
  const json = fenced?.[1] ?? content.trim();
  if (!json.startsWith("{")) return null;
  try {
    const result = changelogSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** The top pick: the highlighted item, else the first new feature, else the first item. */
export function changelogTopPick(changelog: Changelog): IndexedChangelogItem {
  const { items } = changelog;
  const highlighted = items.findIndex((item) => item.highlight === true);
  const index =
    highlighted >= 0
      ? highlighted
      : Math.max(
          items.findIndex((item) => item.category === "new"),
          0,
        );
  return { index, item: items[index] ?? items[0] };
}

/** Items grouped by category in display order, skipping empty categories. */
export function changelogSections(
  changelog: Changelog,
): { category: ChangelogCategory; items: IndexedChangelogItem[] }[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const items = changelog.items.flatMap((item, index) =>
      item.category === category ? [{ index, item }] : [],
    );
    return items.length > 0 ? [{ category, items }] : [];
  });
}

/** "8 new features · 4 speed-ups · 7 fixes", omitting empty categories. */
export function changelogStatsLine(changelog: Changelog): string {
  return changelogSections(changelog)
    .map(({ category, items }) => {
      const [one, many] = CHANGELOG_CATEGORIES[category].noun;
      return `${items.length} ${items.length === 1 ? one : many}`;
    })
    .join(" · ");
}

/** Markdown for the in-app popup and /whats-new, matching the legacy layout. */
export function changelogToMarkdown(changelog: Changelog): string {
  return changelogSections(changelog)
    .map(({ category, items }) => {
      const bullets = items.map(({ item }) => {
        const link = item.path ? ` [Try it](${item.path})` : "";
        return `- **${item.title}**: ${item.summary}${link}`;
      });
      return `${CHANGELOG_CATEGORIES[category].heading}\n${bullets.join("\n")}`;
    })
    .join("\n\n");
}

/** A run summary as markdown: structured runs are converted, legacy runs pass through. */
export function changelogDisplayMarkdown(content: string): string {
  const changelog = parseChangelog(content);
  return changelog ? changelogToMarkdown(changelog) : content;
}

/** Domain-separated HMAC message that authorises one recipient's votes on one run. */
export function changelogVoteHmacMessage(
  runId: string,
  userId: string,
): string {
  return `changelog-vote:${runId}:${userId}`;
}
