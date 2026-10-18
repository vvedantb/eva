/**
 * The weekly changelog's structured shape. The changelog automation returns
 * this as JSON so the email can render a tiered layout; older runs hold plain markdown,
 * so every reader falls back to the raw text when parsing fails. Pure module:
 * safe for queries, node actions and the email templates alike.
 */
import { z } from "zod";

export const CHANGELOG_AUTOMATION_TITLE = "Eva Weekly Changelog";

/** `heading` titles the in-app markdown; `tag` labels the email's pills. */
export const CHANGELOG_CATEGORIES = {
  new: { heading: "✨ New Features", tag: "New" },
  faster: { heading: "⚡ Faster & Smoother", tag: "Faster" },
  fixes: { heading: "🐛 Bug Fixes", tag: "Fixed" },
  improvements: { heading: "🛠 Improvements", tag: "Improved" },
} as const;

export type ChangelogCategory = keyof typeof CHANGELOG_CATEGORIES;

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

export const CHANGELOG_ITEM_VOTES = ["up", "down"] as const;
export const CHANGELOG_EMAIL_RATINGS = ["love", "ok", "meh"] as const;

/**
 * One click of feedback from the email: 👍 / 👎 on one item (the top pick),
 * or a rating of the whole email, which has no item.
 */
export type ChangelogFeedback =
  | { itemIndex: number; vote: (typeof CHANGELOG_ITEM_VOTES)[number] }
  | { vote: (typeof CHANGELOG_EMAIL_RATINGS)[number] };

/** Domain-separated HMAC message that authorises one recipient's feedback on one run. */
export function changelogVoteHmacMessage(
  runId: string,
  userId: string,
): string {
  return `changelog-vote:${runId}:${userId}`;
}
