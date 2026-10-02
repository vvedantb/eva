import { TRUSTED_ASSOCIATIONS } from "./events";

/**
 * Chat and task copy for event-triggered automations. Pure, so the exact text
 * an agent receives is unit-tested (see tests/automationEvents.test.ts).
 */

/** Lines kept from the end of each failed job's log. */
export const LOG_TAIL_LINES = 150;
/** Hard cap on one message, so a runaway log never floods a chat. */
export const MAX_MESSAGE_CHARS = 30_000;
/** CI auto-fix attempts per PR before Eva stops and hands back to a human. */
export const MAX_CI_FIX_ATTEMPTS = 3;

export interface FailedCheck {
  name: string;
  url: string | null;
  summary: string | null;
  logTail: string | null;
}

export interface FeedbackItem {
  author: string;
  body: string;
  url: string;
  /** Inline review comments only. */
  path: string | null;
  line: number | null;
}

interface GitHubAuthor {
  login: string;
  type: string;
}

/** The fields Eva reads from GitHub's review, inline and issue comments. */
export interface RawFeedback {
  reviews: ReadonlyArray<{
    user: GitHubAuthor | null;
    author_association: string;
    body: string | null;
    html_url: string;
    submitted_at?: string;
  }>;
  inline: ReadonlyArray<{
    user: GitHubAuthor | null;
    author_association: string;
    body: string;
    html_url: string;
    path: string;
    line?: number | null;
    original_line?: number | null;
    created_at: string;
  }>;
  comments: ReadonlyArray<{
    user: GitHubAuthor | null;
    author_association: string;
    body?: string;
    html_url: string;
    created_at: string;
  }>;
}

/**
 * Trusted human feedback newer than `after` (GitHub time), oldest first, and
 * the time of the newest item, which becomes the next run's `after`. Using
 * GitHub's own timestamps rather than Eva's clock means a comment that lands
 * while a batch is being sent is simply picked up by the next one.
 */
export function collectFeedback(
  raw: RawFeedback,
  after: number,
): { items: FeedbackItem[]; newestAt: number | null } {
  const timed: Array<FeedbackItem & { at: number }> = [];
  const add = (
    user: GitHubAuthor | null,
    association: string,
    createdAt: string | undefined,
    item: Omit<FeedbackItem, "author">,
  ) => {
    if (user === null || user.type === "Bot") return;
    if (!TRUSTED_ASSOCIATIONS.has(association)) return;
    if (createdAt === undefined || !item.body.trim()) return;
    const at = Date.parse(createdAt);
    if (!(at > after)) return;
    timed.push({ ...item, author: user.login, at });
  };

  for (const review of raw.reviews) {
    add(review.user, review.author_association, review.submitted_at, {
      body: review.body ?? "",
      url: review.html_url,
      path: null,
      line: null,
    });
  }
  for (const comment of raw.inline) {
    add(comment.user, comment.author_association, comment.created_at, {
      body: comment.body,
      url: comment.html_url,
      path: comment.path,
      line: comment.line ?? comment.original_line ?? null,
    });
  }
  for (const comment of raw.comments) {
    add(comment.user, comment.author_association, comment.created_at, {
      body: comment.body ?? "",
      url: comment.html_url,
      path: null,
      line: null,
    });
  }

  timed.sort((a, b) => a.at - b.at);
  return {
    items: timed.map(({ at: _at, ...item }) => item),
    newestAt: timed.length === 0 ? null : timed[timed.length - 1].at,
  };
}

// GitHub Actions prefixes every log line with an ISO timestamp.
const ACTIONS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z /;
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

/** Last `maxLines` lines of a job log, without timestamps or colour codes. */
export function tailLog(log: string, maxLines = LOG_TAIL_LINES): string {
  const lines = log
    .replace(ANSI_ESCAPE, "")
    .split("\n")
    .map((line) => line.replace(ACTIONS_TIMESTAMP, "").trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-maxLines).join("\n");
}

function capLength(text: string): string {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS)}\n\n…(truncated)`;
}

export function buildCiFailureMessage(params: {
  prUrl: string;
  prNumber: number;
  headSha: string;
  attempt: number;
  checks: FailedCheck[];
  instructions: string;
}): string {
  const { prUrl, prNumber, headSha, attempt, checks, instructions } = params;
  const sections = checks.map((check) => {
    const heading = check.url
      ? `### ${check.name} ([details](${check.url}))`
      : `### ${check.name}`;
    const parts = [heading];
    if (check.summary) parts.push(check.summary);
    if (check.logTail) parts.push("```\n" + check.logTail + "\n```");
    return parts.join("\n\n");
  });
  return capLength(
    [
      `**CI failed on #${prNumber}** (${prUrl}) at \`${headSha.slice(0, 7)}\` — auto-fix attempt ${attempt} of ${MAX_CI_FIX_ATTEMPTS}.`,
      sections.length > 0
        ? sections.join("\n\n")
        : "GitHub reported a failed check suite but listed no failed check runs. Open the PR's checks to see what failed.",
      instructions,
    ].join("\n\n"),
  );
}

export function buildCiGiveUpMessage(prNumber: number): string {
  return `**CI is still failing on #${prNumber}.** Eva has tried ${MAX_CI_FIX_ATTEMPTS} automatic fixes and is stopping here. Do not push another fix unless asked; summarise what you tried and what you think is still wrong.`;
}

export function buildReviewFeedbackMessage(params: {
  prUrl: string;
  prNumber: number;
  items: FeedbackItem[];
  instructions: string;
}): string {
  const { prUrl, prNumber, items, instructions } = params;
  const quoted = items.map((item) => {
    const where =
      item.path === null
        ? ""
        : ` on \`${item.path}${item.line === null ? "" : `:${item.line}`}\``;
    const body = item.body
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    return `**@${item.author}**${where} ([link](${item.url})):\n${body}`;
  });
  return capLength(
    [
      `**New review feedback on #${prNumber}** (${prUrl})`,
      quoted.join("\n\n"),
      instructions,
    ].join("\n\n"),
  );
}

export function buildIssueTaskDescription(params: {
  issueUrl: string;
  issueNumber: number;
  body: string;
  instructions: string;
}): string {
  const { issueUrl, issueNumber, body, instructions } = params;
  return capLength(
    [
      `GitHub issue #${issueNumber}: ${issueUrl}`,
      body.trim() || "(The issue has no description.)",
      instructions,
    ].join("\n\n"),
  );
}
