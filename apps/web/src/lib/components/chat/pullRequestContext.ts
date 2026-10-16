import { z } from "zod";
import { prNumberFromGithubUrl } from "@/lib/githubPr";

/**
 * A pull request attached to the next prompt as context. Dragging a PR row
 * into the composer carries one of these; the send appends it as a
 * `<pull_request>` block so the agent can `gh pr view` it.
 */
export interface PullRequestContext {
  readonly number: number;
  readonly title: string;
  /** Canonical GitHub `html_url`. The identity of the chip (dedupe key). */
  readonly url: string;
  readonly headBranch?: string;
  readonly baseBranch?: string;
  readonly state: "open" | "merged" | "closed";
  readonly isDraft: boolean;
}

/** Custom drag type. Only Eva PR rows set it, so other drags are ignored. */
export const PULL_REQUEST_DRAG_MIME = "application/x-eva-pull-request";

const MAX_TITLE_LENGTH = 300;
const MAX_BRANCH_LENGTH = 255;

/**
 * The drag payload is untrusted: any page can set this MIME type on a drag
 * that ends in Eva. Only a github.com pull URL whose number matches passes.
 */
const pullRequestContextSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().max(MAX_TITLE_LENGTH),
    url: z.string().regex(/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/),
    headBranch: z.string().min(1).max(MAX_BRANCH_LENGTH).optional(),
    baseBranch: z.string().min(1).max(MAX_BRANCH_LENGTH).optional(),
    state: z.enum(["open", "merged", "closed"]),
    isDraft: z.boolean(),
  })
  .refine((pr) => prNumberFromGithubUrl(pr.url) === pr.number);

/** Builds the payload from a `pullRequests` row (Eva folds draft into state). */
export function pullRequestContextFromRow(row: {
  prNumber: number;
  prUrl: string;
  title?: string;
  headBranch?: string;
  baseBranch?: string;
  state: "draft" | "open" | "merged" | "closed";
}): PullRequestContext {
  return {
    number: row.prNumber,
    title: row.title ?? `Pull request #${row.prNumber}`,
    url: row.prUrl,
    headBranch: row.headBranch,
    baseBranch: row.baseBranch,
    state: row.state === "draft" ? "open" : row.state,
    isDraft: row.state === "draft",
  };
}

export function encodePullRequestDragPayload(pr: PullRequestContext): string {
  return JSON.stringify(pr);
}

/** Null for anything that is not a valid PR payload. */
export function decodePullRequestDragPayload(
  raw: string,
): PullRequestContext | null {
  let json: ReturnType<typeof JSON.parse>;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = pullRequestContextSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Sets the custom type for the composer, plus the URL as `text/uri-list` and
 * `text/plain` so a drop outside Eva (a browser tab, a text field) still gets
 * a link.
 */
export function setPullRequestDragData(
  dataTransfer: DataTransfer,
  pr: PullRequestContext,
): void {
  dataTransfer.effectAllowed = "copyLink";
  dataTransfer.setData(PULL_REQUEST_DRAG_MIME, encodePullRequestDragPayload(pr));
  dataTransfer.setData("text/uri-list", pr.url);
  dataTransfer.setData("text/plain", pr.url);
}

/** Adds `pr` unless a chip for the same URL is already there. */
export function addPullRequestContext(
  current: ReadonlyArray<PullRequestContext>,
  pr: PullRequestContext,
): ReadonlyArray<PullRequestContext> {
  return current.some((item) => item.url === pr.url) ? current : [...current, pr];
}

export function pullRequestStateLabel(pr: PullRequestContext): string {
  return pr.isDraft ? "draft" : pr.state;
}

function escapePullRequestText(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

export function formatPullRequestBlock(pr: PullRequestContext): string {
  const lines = [
    `number: ${pr.number}`,
    `title: ${pr.title}`,
    `url: ${pr.url}`,
    ...(pr.headBranch ? [`head: ${pr.headBranch}`] : []),
    ...(pr.baseBranch ? [`base: ${pr.baseBranch}`] : []),
    `state: ${pullRequestStateLabel(pr)}`,
  ].map(escapePullRequestText);
  return `<pull_request>\n${lines.join("\n")}\n</pull_request>`;
}

export function appendPullRequestsToPrompt(
  prompt: string,
  pullRequests: ReadonlyArray<PullRequestContext>,
): string {
  if (pullRequests.length === 0) return prompt;
  const blocks = pullRequests.map(formatPullRequestBlock).join("\n\n");
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${blocks}` : blocks;
}
