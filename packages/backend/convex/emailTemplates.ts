/**
 * Pure HTML builders for transactional emails. No Convex or Node dependencies,
 * so this module can be imported from both "use node" actions and elsewhere.
 * Email clients ignore <style>/external CSS, so every style is inlined.
 */

import {
  CHANGELOG_CATEGORIES,
  changelogSections,
  changelogTopPick,
  type Changelog,
  type ChangelogCategory,
  type ChangelogFeedback,
  type ChangelogItem,
  type IndexedChangelogItem,
} from "./_changelog/entry";

/** A single unread notification rendered in the daily digest. */
export interface DigestNotification {
  title: string;
  message?: string;
  href?: string;
  type: string;
  createdAt: number;
  contextLabel?: string;
}

export interface DigestEmailOptions {
  recipientName?: string;
  /** Base URL of the web app, e.g. https://app.example.com (no trailing slash needed). */
  appUrl: string;
  notifications: DigestNotification[];
  /**
   * Overrides the default "You have N unread notifications" heading. Used by the
   * instant single-notification email to lead with the activity itself.
   */
  heading?: string;
  /**
   * Optional muted line under the heading clarifying the scope, e.g. the daily
   * digest's "From the past 24 hours". Omitted by the instant email.
   */
  subtext?: string;
}

const BRAND = "#4f46e5";
const TEXT = "#111827";
const MUTED = "#6b7280";
const SURFACE = "#f3f4f6";
/** Light tint of BRAND for the changelog's top-pick card. */
const BRAND_TINT = "#eef2ff";

// Inter first, with a system fallback stack for clients that ignore web fonts
// (Gmail, Outlook desktop). Apple Mail / iOS Mail load Inter via the @import.
const FONT_STACK =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapes the five HTML-significant characters so user content cannot break the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Removes trailing slashes so a base URL can have a path appended cleanly. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Returns the "Hi Name," greeting line, escaping the name when present. */
function renderGreeting(recipientName?: string): string {
  return recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi,";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Formats a timestamp as "DD Mon YYYY" in UTC for a stable, locale-independent output. */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Joins the app base URL with a notification path, tolerating slashes on either side. */
function buildLink(appUrl: string, href: string): string {
  const base = stripTrailingSlash(appUrl);
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${base}${path}`;
}

/** A filled brand-colour call-to-action link. */
function renderButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;font-size:14px;font-weight:600;color:#ffffff;background-color:${BRAND};border-radius:8px;text-decoration:none;">${escapeHtml(label)}</a>`;
}

const DEFAULT_FOOTER_TEXT =
  "You are receiving this email because you have unread notifications. Open the app to manage them.";

/** Wraps body content in a centred, responsive email shell with a logo header and footer. */
export function wrapEmailLayout(opts: {
  title: string;
  bodyHtml: string;
  /** Base URL of the web app, used to load the logo from its public assets. */
  appUrl: string;
  /** Footer line explaining why the recipient got the email. Defaults to the digest wording. */
  footerText?: string;
  /** Optional centred band between the body and the footer, e.g. a feedback prompt. */
  closingHtml?: string;
}): string {
  const logoUrl = `${stripTrailingSlash(opts.appUrl)}/icon.png`;
  const footerText = opts.footerText ?? DEFAULT_FOOTER_TEXT;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(opts.title)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      @media (max-width: 600px) { .eva-stack { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; } }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${SURFACE};font-family:${FONT_STACK};color:${TEXT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${SURFACE};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;">
                <img src="${escapeHtml(logoUrl)}" width="44" height="44" alt="Eva" style="display:block;border-radius:12px;margin-bottom:20px;" />
                ${opts.bodyHtml}
              </td>
            </tr>
            ${
              opts.closingHtml
                ? `<tr><td align="center" style="padding:28px 32px;background-color:#fafafa;">${opts.closingHtml}</td></tr>`
                : ""
            }
            <tr>
              <td style="padding:20px 32px;background-color:${SURFACE};">
                <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">
                  ${escapeHtml(footerText)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Renders one notification row: title, optional message, date, and optional view link. */
function renderNotification(n: DigestNotification, appUrl: string): string {
  const context = n.contextLabel
    ? `<p style="margin:4px 0 0;font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(n.contextLabel)}</p>`
    : "";
  const message = n.message
    ? `<p style="margin:4px 0 0;font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(n.message)}</p>`
    : "";
  const link = n.href
    ? `<a href="${escapeHtml(buildLink(appUrl, n.href))}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:${BRAND};text-decoration:none;">View &rarr;</a>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;background-color:${SURFACE};border-radius:10px;">
    <tr>
      <td style="padding:16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:15px;font-weight:600;line-height:21px;color:${TEXT};">${escapeHtml(n.title)}</td>
            <td align="right" style="font-size:12px;color:${MUTED};white-space:nowrap;padding-left:12px;">${escapeHtml(formatDate(n.createdAt))}</td>
          </tr>
        </table>
        ${context}
        ${message}
        ${link}
      </td>
    </tr>
  </table>`;
}

/** Builds the full daily unread-notification digest email as an HTML string. */
export function buildNotificationDigestHtml(opts: DigestEmailOptions): string {
  const count = opts.notifications.length;
  const greeting = renderGreeting(opts.recipientName);
  const heading =
    opts.heading ??
    `You have ${count} unread notification${count === 1 ? "" : "s"}`;
  const rows = opts.notifications
    .map((n) => renderNotification(n, opts.appUrl))
    .join("");
  const subtext = opts.subtext
    ? `<p style="margin:0 0 20px;font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(opts.subtext)}</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:15px;line-height:22px;color:${TEXT};">${greeting}</p>
    <h1 style="margin:0 0 ${opts.subtext ? "6px" : "20px"};font-size:20px;line-height:28px;font-weight:700;color:${TEXT};">${heading}</h1>
    ${subtext}
    ${rows}
    <a href="${escapeHtml(buildLink(opts.appUrl, "/inbox"))}" style="display:inline-block;margin-top:8px;padding:10px 18px;font-size:14px;font-weight:600;color:#ffffff;background-color:${BRAND};border-radius:8px;text-decoration:none;">View all notifications</a>
  `;

  return wrapEmailLayout({ title: heading, bodyHtml, appUrl: opts.appUrl });
}

export interface AutomationEmailOptions {
  recipientName?: string;
  /** Base URL of the web app, e.g. https://app.example.com (no trailing slash needed). */
  appUrl: string;
  /** Run summary already converted from markdown to trusted HTML by the caller. */
  contentHtml: string;
  publishedAt: number;
  /** Heading shown above the body, typically the automation title. */
  heading: string;
}

/**
 * Builds an automation result announcement email (e.g. the weekly changelog).
 * The caller converts the stored markdown to HTML (contentHtml) before passing
 * it in, so this stays a pure module with no markdown dependency.
 */
export function buildAutomationEmailHtml(opts: AutomationEmailOptions): string {
  const greeting = renderGreeting(opts.recipientName);

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:15px;line-height:22px;color:${TEXT};">${greeting}</p>
    <h1 style="margin:0 0 4px;font-size:20px;line-height:28px;font-weight:700;color:${TEXT};">${escapeHtml(opts.heading)}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:${MUTED};">${escapeHtml(formatDate(opts.publishedAt))}</p>
    <div style="font-size:14px;line-height:22px;color:${TEXT};">${opts.contentHtml}</div>
    <p style="margin:24px 0 0;">
      ${renderButton(stripTrailingSlash(opts.appUrl), "Open the app")}
    </p>
  `;

  return wrapEmailLayout({
    title: opts.heading,
    bodyHtml,
    appUrl: opts.appUrl,
    footerText:
      "You are receiving this email because email notifications are enabled. Open the app to manage them.",
  });
}

/** Pill colours per category: foreground text on a light tint of the same hue. */
const CATEGORY_COLOURS: Record<ChangelogCategory, { fg: string; bg: string }> =
  {
    new: { fg: BRAND, bg: BRAND_TINT },
    faster: { fg: "#b45309", bg: "#fef3c7" },
    fixes: { fg: "#047857", bg: "#d1fae5" },
    improvements: { fg: "#475569", bg: "#e2e8f0" },
  };

export interface ChangelogEmailOptions {
  /** Base URL of the web app, e.g. https://app.example.com (no trailing slash needed). */
  appUrl: string;
  changelog: Changelog;
  publishedAt: number;
  /** Signed one-click link that records this recipient's feedback. */
  feedbackUrl: (feedback: ChangelogFeedback) => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO 8601 week number of a UTC timestamp (weeks start Monday; week 1 holds 4 Jan). */
function isoWeek(timestamp: number): number {
  const d = new Date(timestamp);
  const day = d.getUTCDay() || 7;
  const thursday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 4 - day,
  );
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday - yearStart) / DAY_MS + 1) / 7);
}

/**
 * "Week 42 · 12–18 Oct 2026": the 7 days before publication, which is the
 * window the changelog prompt covers. Month and year show only where they change.
 */
function formatChangelogWeek(publishedAt: number): string {
  const start = new Date(publishedAt - 7 * DAY_MS);
  const end = new Date(publishedAt - DAY_MS);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  const from = sameMonth
    ? `${start.getUTCDate()}`
    : sameYear
      ? `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`
      : formatDate(start.getTime());
  return `Week ${isoWeek(start.getTime())} · ${from}–${formatDate(end.getTime())}`;
}

/** A small rounded category label, e.g. a green "Fixed". */
function renderCategoryPill(category: ChangelogCategory): string {
  const { fg, bg } = CATEGORY_COLOURS[category];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background-color:${bg};color:${fg};font-size:11px;line-height:16px;font-weight:600;white-space:nowrap;">${CHANGELOG_CATEGORIES[category].tag}</span>`;
}

/** Inline "Try it →" link into the app, or nothing when the item has no page. */
function renderTryLink(item: ChangelogItem, appUrl: string): string {
  return item.path
    ? ` <a href="${escapeHtml(buildLink(appUrl, item.path))}" style="font-size:13px;font-weight:600;color:${BRAND};text-decoration:none;white-space:nowrap;">Try it &rarr;</a>`
    : "";
}

/** Count pills under the title: "New ×7  Faster ×2 …". */
function renderCountPills(changelog: Changelog): string {
  return changelogSections(changelog)
    .map(
      ({ category, items }) =>
        `<span style="display:inline-block;white-space:nowrap;margin:0 10px 6px 0;">${renderCategoryPill(category)}&nbsp;<span style="font-size:13px;color:${MUTED};">&times;${items.length}</span></span>`,
    )
    .join(" ");
}

/** The week's top pick: tinted card, large title, button, and the only 👍 / 👎. */
function renderTopPick(
  { index, item }: IndexedChangelogItem,
  opts: ChangelogEmailOptions,
): string {
  const href = item.path
    ? buildLink(opts.appUrl, item.path)
    : stripTrailingSlash(opts.appUrl);
  const vote = (v: "up" | "down", emoji: string, label: string) =>
    `<a href="${escapeHtml(opts.feedbackUrl({ itemIndex: index, vote: v }))}" title="${label}" style="text-decoration:none;font-size:16px;padding:0 2px;">${emoji}</a>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 28px;background-color:${BRAND_TINT};border-radius:14px;">
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 6px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND};">Top pick this week</p>
        <p style="margin:0;font-size:22px;line-height:30px;font-weight:700;color:${TEXT};">${escapeHtml(item.title)}</p>
        <p style="margin:8px 0 18px;font-size:15px;line-height:23px;color:${TEXT};">${escapeHtml(item.summary)}</p>
        ${renderButton(href, "Open Eva")}
        <span style="margin-left:14px;font-size:13px;color:${MUTED};white-space:nowrap;">Useful? ${vote("up", "&#128077;", "Useful")} ${vote("down", "&#128078;", "Not useful")}</span>
      </td>
    </tr>
  </table>`;
}

/** "Also new": the remaining new features as a 2-column grid that stacks on phones. */
function renderNewFeatureGrid(
  entries: IndexedChangelogItem[],
  appUrl: string,
): string {
  if (entries.length === 0) return "";
  // Each column pads only its inner side, so the grid lines up with the body edges.
  const tile = ({ item }: IndexedChangelogItem, column: number) => `<td class="eva-stack" width="50%" style="padding:0 ${column === 0 ? 6 : 0}px 12px ${column === 1 ? 6 : 0}px;vertical-align:top;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${SURFACE};border-radius:12px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0;font-size:15px;line-height:21px;font-weight:600;color:${TEXT};">${escapeHtml(item.title)}</p>
          <p style="margin:6px 0 0;font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(item.summary)}${renderTryLink(item, appUrl)}</p>
        </td>
      </tr>
    </table>
  </td>`;
  const rows: string[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const pair = entries.slice(i, i + 2).map((entry, column) => tile(entry, column));
    if (pair.length === 1) pair.push(`<td class="eva-stack" width="50%"></td>`);
    rows.push(`<tr>${pair.join("")}</tr>`);
  }
  return `<h2 style="margin:0 0 12px;font-size:17px;line-height:24px;font-weight:700;color:${TEXT};">Also new</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">${rows.join("")}</table>`;
}

/** "Faster, fixed and polished": every other change as a compact tagged row. */
function renderOtherChanges(
  entries: { category: ChangelogCategory; entry: IndexedChangelogItem }[],
  appUrl: string,
): string {
  if (entries.length === 0) return "";
  const rows = entries.map(
    ({ category, entry: { item } }) => `<tr>
      <td style="padding:0 12px 14px 0;vertical-align:top;width:76px;">${renderCategoryPill(category)}</td>
      <td style="padding:0 0 14px;vertical-align:top;font-size:14px;line-height:20px;color:${TEXT};">
        <strong>${escapeHtml(item.title)}</strong><br />
        <span style="color:${MUTED};">${escapeHtml(item.summary)}</span>${renderTryLink(item, appUrl)}
      </td>
    </tr>`,
  );
  return `<h2 style="margin:8px 0 14px;font-size:17px;line-height:24px;font-weight:700;color:${TEXT};">Faster, fixed and polished</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

/** One rating for the whole email: three one-click faces. */
function renderEmailRating(opts: ChangelogEmailOptions): string {
  const faces = [
    { vote: "love", emoji: "&#128525;", label: "Loved it" },
    { vote: "ok", emoji: "&#128578;", label: "It was fine" },
    { vote: "meh", emoji: "&#128528;", label: "Not for me" },
  ] as const;
  const links = faces
    .map(
      ({ vote, emoji, label }) =>
        `<a href="${escapeHtml(opts.feedbackUrl({ vote }))}" title="${label}" style="display:inline-block;margin:0 6px;padding:8px 14px;border-radius:999px;background-color:#ffffff;font-size:22px;line-height:26px;text-decoration:none;">${emoji}</a>`,
    )
    .join("");
  return `<p style="margin:0 0 12px;font-size:15px;line-height:22px;font-weight:600;color:${TEXT};">How was this week&rsquo;s update?</p>
  ${links}
  <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:${MUTED};">One click. Or reply to this email and tell us anything.</p>`;
}

/**
 * Builds the weekly changelog email in three tiers so weight follows
 * importance: the top pick as a large card, other new features as a grid, and
 * everything else as a compact tagged list. Feedback is one 👍 / 👎 on the top
 * pick and one rating for the whole email, not a vote on every item.
 */
export function buildChangelogEmailHtml(opts: ChangelogEmailOptions): string {
  const topPick = changelogTopPick(opts.changelog);
  const rest = changelogSections(opts.changelog).flatMap(({ category, items }) =>
    items
      .filter(({ index }) => index !== topPick.index)
      .map((entry) => ({ category, entry })),
  );
  const newFeatures = rest.flatMap(({ category, entry }) =>
    category === "new" ? [entry] : [],
  );
  const others = rest.filter(({ category }) => category !== "new");

  const bodyHtml = `
    <p style="margin:0 0 2px;font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(formatChangelogWeek(opts.publishedAt))}</p>
    <h1 style="margin:0 0 12px;font-size:24px;line-height:32px;font-weight:700;color:${TEXT};">What&rsquo;s new in Eva</h1>
    <p style="margin:0 0 -6px;">${renderCountPills(opts.changelog)}</p>
    ${renderTopPick(topPick, opts)}
    ${renderNewFeatureGrid(newFeatures, opts.appUrl)}
    ${renderOtherChanges(others, opts.appUrl)}
  `;

  return wrapEmailLayout({
    title: "What's new in Eva",
    bodyHtml,
    closingHtml: renderEmailRating(opts),
    appUrl: opts.appUrl,
    footerText:
      "You are receiving this email because email notifications are enabled. Open the app to manage them.",
  });
}

/** The page a changelog vote link opens: a thank-you, or a notice that the item is gone. */
export function buildChangelogVotePageHtml(opts: {
  appUrl: string;
  recorded: boolean;
}): string {
  const heading = opts.recorded
    ? "Thanks for your feedback"
    : "This update is no longer available";
  const message = opts.recorded
    ? "Your feedback helps us decide what to improve next. To change it, click another option in the same email."
    : "We could not record your feedback because this changelog entry no longer exists.";
  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:20px;line-height:28px;font-weight:700;color:${TEXT};">${heading}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:22px;color:${MUTED};">${message}</p>
    ${renderButton(stripTrailingSlash(opts.appUrl), "Open the app")}
  `;
  return wrapEmailLayout({
    title: heading,
    bodyHtml,
    appUrl: opts.appUrl,
    footerText: "You opened a feedback link from the Eva weekly changelog email.",
  });
}

export interface AgentEmailOptions {
  recipientName?: string;
  /** Base URL of the web app, e.g. https://app.example.com (no trailing slash needed). */
  appUrl: string;
  subject: string;
  /** Body already converted from markdown to HTML by the caller. */
  contentHtml: string;
}

/**
 * The shell for the MCP `send_email` tool: an agent mailing its own user a
 * result. The caller renders the markdown body, so this stays a pure module.
 */
export function buildAgentEmailHtml(opts: AgentEmailOptions): string {
  const greeting = renderGreeting(opts.recipientName);

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:15px;line-height:22px;color:${TEXT};">${greeting}</p>
    <h1 style="margin:0 0 20px;font-size:20px;line-height:28px;font-weight:700;color:${TEXT};">${escapeHtml(opts.subject)}</h1>
    <div style="font-size:14px;line-height:22px;color:${TEXT};">${opts.contentHtml}</div>
    <p style="margin:24px 0 0;">
      ${renderButton(stripTrailingSlash(opts.appUrl), "Open the app")}
    </p>
  `;

  return wrapEmailLayout({
    title: opts.subject,
    bodyHtml,
    appUrl: opts.appUrl,
    footerText:
      "An Eva agent you were running sent this email at your request.",
  });
}
