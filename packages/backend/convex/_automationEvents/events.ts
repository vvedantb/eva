import { v, type Infer } from "convex/values";
import { z } from "zod";
import {
  DEFAULT_ISSUE_LABEL,
  type AutomationTrigger,
  type RepoEventKind,
} from "./labels";

export {
  DEFAULT_ISSUE_LABEL,
  REPO_EVENT_LABELS,
  type AutomationTrigger,
  type RepoEventKind,
} from "./labels";

/**
 * GitHub webhooks normalised into the few repo events automations react to.
 * Pure: `http.ts` verifies the signature, then hands the raw body here.
 */

const repoRef = { owner: v.string(), name: v.string() };

export const repoEventValidator = v.union(
  v.object({
    kind: v.literal("ci_failed"),
    ...repoRef,
    prUrl: v.string(),
    prNumber: v.number(),
    headSha: v.string(),
  }),
  v.object({
    kind: v.literal("pr_feedback"),
    ...repoRef,
    prUrl: v.string(),
    prNumber: v.number(),
  }),
  v.object({
    kind: v.literal("issue_labeled"),
    ...repoRef,
    label: v.string(),
    issueUrl: v.string(),
    issueNumber: v.number(),
    title: v.string(),
    body: v.string(),
  }),
  v.object({
    kind: v.union(v.literal("pr_opened"), v.literal("pr_merged")),
    ...repoRef,
    prUrl: v.string(),
    prNumber: v.number(),
    title: v.string(),
  }),
);

export type RepoEvent = Infer<typeof repoEventValidator>;

/** Delay before a queued event runs, so a burst of webhooks lands as one run. */
export const EVENT_DEBOUNCE_MS: Record<RepoEventKind, number> = {
  // Each check suite (Actions, Vercel, …) completes separately.
  ci_failed: 90_000,
  // One review arrives as a review event plus one event per inline comment.
  pr_feedback: 60_000,
  issue_labeled: 0,
  pr_opened: 0,
  pr_merged: 0,
};

/**
 * Dedupe key for a run. Webhooks sharing a key while a run is still queued
 * fold into that run instead of starting another.
 */
export function repoEventKey(event: RepoEvent): string {
  switch (event.kind) {
    case "ci_failed":
      return `${event.prUrl}@${event.headSha}`;
    case "issue_labeled":
      return event.issueUrl;
    case "pr_feedback":
    case "pr_opened":
    case "pr_merged":
      return event.prUrl;
  }
}

export function repoEventTargetUrl(event: RepoEvent): string {
  return event.kind === "issue_labeled" ? event.issueUrl : event.prUrl;
}

export function triggerMatchesEvent(
  trigger: AutomationTrigger | undefined,
  event: RepoEvent,
): boolean {
  if (trigger === undefined || trigger.kind !== "event") return false;
  if (trigger.event !== event.kind) return false;
  if (event.kind !== "issue_labeled") return true;
  const wanted = (trigger.label ?? DEFAULT_ISSUE_LABEL).trim().toLowerCase();
  return wanted === event.label.trim().toLowerCase();
}

/** Plain-text event block appended to a `run` automation's prompt. */
export function describeRepoEvent(event: RepoEvent): string {
  const repo = `${event.owner}/${event.name}`;
  switch (event.kind) {
    case "ci_failed":
      return `CI failed on ${event.prUrl} (${repo}) at commit ${event.headSha}.`;
    case "pr_feedback":
      return `New review feedback on ${event.prUrl} (${repo}).`;
    case "issue_labeled":
      return `Issue ${event.issueUrl} was labelled "${event.label}".\nTitle: ${event.title}\n\n${event.body}`;
    case "pr_opened":
      return `PR opened: ${event.prUrl} — ${event.title}`;
    case "pr_merged":
      return `PR merged: ${event.prUrl} — ${event.title}`;
  }
}

// ── Webhook boundary ────────────────────────────────────────────────────────

const repositorySchema = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
});

const senderSchema = z
  .object({ type: z.string().nullable().catch(null) })
  .nullable()
  .catch(null);

/**
 * Only people with write access may put text in front of the agent. Anyone
 * can comment on a public repo's PR, so this is the prompt-injection gate.
 */
export const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

const checkSuiteSchema = z.object({
  action: z.string(),
  check_suite: z.object({
    conclusion: z.string().nullable().catch(null),
    head_sha: z.string(),
    pull_requests: z
      .array(z.object({ number: z.number() }))
      .catch([]),
  }),
  repository: repositorySchema,
});

const issuesSchema = z.object({
  action: z.string(),
  label: z.object({ name: z.string() }).nullable().catch(null),
  issue: z.object({
    number: z.number(),
    html_url: z.string(),
    title: z.string(),
    body: z.string().nullable().catch(null),
    pull_request: z.object({ url: z.string() }).nullable().optional(),
  }),
  repository: repositorySchema,
  sender: senderSchema,
});

const issueCommentSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    pull_request: z.object({ html_url: z.string() }).nullable().catch(null),
  }),
  comment: z.object({ author_association: z.string() }),
  repository: repositorySchema,
  sender: senderSchema,
});

const reviewSchema = z.object({
  action: z.string(),
  review: z.object({
    state: z.string(),
    author_association: z.string(),
  }),
  pull_request: z.object({ number: z.number(), html_url: z.string() }),
  repository: repositorySchema,
  sender: senderSchema,
});

const reviewCommentSchema = z.object({
  action: z.string(),
  comment: z.object({ author_association: z.string() }),
  pull_request: z.object({ number: z.number(), html_url: z.string() }),
  repository: repositorySchema,
  sender: senderSchema,
});

const pullRequestSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number(),
    html_url: z.string(),
    title: z.string(),
    merged: z.boolean().nullable().catch(null),
  }),
  repository: repositorySchema,
  sender: senderSchema,
});

function isBot(sender: z.infer<typeof senderSchema>): boolean {
  return sender?.type === "Bot";
}

function pullUrl(owner: string, name: string, prNumber: number): string {
  return `https://github.com/${owner}/${name}/pull/${prNumber}`;
}

/**
 * Maps one GitHub webhook to zero or more repo events. Unknown events, bad
 * payloads, bot senders and untrusted commenters all map to `[]`.
 */
export function parseRepoEvents(
  githubEvent: string,
  body: string,
): RepoEvent[] {
  try {
    return parseRepoEventsOrThrow(githubEvent, body);
  } catch {
    // Malformed JSON: GitHub still gets its 200, nothing is dispatched.
    return [];
  }
}

function parseRepoEventsOrThrow(
  githubEvent: string,
  body: string,
): RepoEvent[] {
  switch (githubEvent) {
    case "check_suite": {
      const parsed = checkSuiteSchema.safeParse(JSON.parse(body));
      if (!parsed.success || parsed.data.action !== "completed") return [];
      const { check_suite: suite, repository } = parsed.data;
      if (suite.conclusion !== "failure" && suite.conclusion !== "timed_out") {
        return [];
      }
      const owner = repository.owner.login;
      const name = repository.name;
      return suite.pull_requests.map((pr) => ({
        kind: "ci_failed",
        owner,
        name,
        prUrl: pullUrl(owner, name, pr.number),
        prNumber: pr.number,
        headSha: suite.head_sha,
      }));
    }
    case "issues": {
      const parsed = issuesSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return [];
      const { action, label, issue, repository, sender } = parsed.data;
      if (action !== "labeled" || label === null || isBot(sender)) return [];
      // GitHub delivers PRs through `issues` too; only real issues count.
      if (issue.pull_request != null) return [];
      return [
        {
          kind: "issue_labeled",
          owner: repository.owner.login,
          name: repository.name,
          label: label.name,
          issueUrl: issue.html_url,
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body ?? "",
        },
      ];
    }
    case "issue_comment": {
      const parsed = issueCommentSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return [];
      const { action, issue, comment, repository, sender } = parsed.data;
      if (action !== "created" || issue.pull_request === null) return [];
      if (isBot(sender)) return [];
      if (!TRUSTED_ASSOCIATIONS.has(comment.author_association)) return [];
      return [
        {
          kind: "pr_feedback",
          owner: repository.owner.login,
          name: repository.name,
          prUrl: issue.pull_request.html_url,
          prNumber: issue.number,
        },
      ];
    }
    case "pull_request_review": {
      const parsed = reviewSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return [];
      const { action, review, pull_request: pr, repository, sender } =
        parsed.data;
      if (action !== "submitted" || isBot(sender)) return [];
      // An approval with no request attached gives the agent nothing to do.
      if (review.state.toLowerCase() === "approved") return [];
      if (!TRUSTED_ASSOCIATIONS.has(review.author_association)) return [];
      return [
        {
          kind: "pr_feedback",
          owner: repository.owner.login,
          name: repository.name,
          prUrl: pr.html_url,
          prNumber: pr.number,
        },
      ];
    }
    case "pull_request_review_comment": {
      const parsed = reviewCommentSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return [];
      const { action, comment, pull_request: pr, repository, sender } =
        parsed.data;
      if (action !== "created" || isBot(sender)) return [];
      if (!TRUSTED_ASSOCIATIONS.has(comment.author_association)) return [];
      return [
        {
          kind: "pr_feedback",
          owner: repository.owner.login,
          name: repository.name,
          prUrl: pr.html_url,
          prNumber: pr.number,
        },
      ];
    }
    case "pull_request": {
      const parsed = pullRequestSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return [];
      const { action, pull_request: pr, repository } = parsed.data;
      const base = {
        owner: repository.owner.login,
        name: repository.name,
        prUrl: pr.html_url,
        prNumber: pr.number,
        title: pr.title,
      };
      if (action === "opened") return [{ kind: "pr_opened", ...base }];
      if (action === "closed" && pr.merged === true) {
        return [{ kind: "pr_merged", ...base }];
      }
      return [];
    }
    default:
      return [];
  }
}
