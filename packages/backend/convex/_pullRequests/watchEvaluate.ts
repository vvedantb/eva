import type { Infer } from "convex/values";
import type { prWatchValidator } from "../validators";
import type { CiCompleted, RepoEvent } from "../_automationEvents/events";
import {
  capLength,
  quoteFeedback,
  type FeedbackItem,
} from "../_automationEvents/messages";

/**
 * Pure rules of the agent's PR watch: which webhooks matter, what changed since
 * the agent was last told, and the message that wakes it. Unit-tested in
 * tests/prWatch.test.ts.
 */

export type PrWatch = Infer<typeof prWatchValidator>;

/**
 * Comment-only wakes in a row before the watch ends. Check or conflict news
 * resets the count, so this only stops a reviewer loop, not a long review.
 */
export const PR_WATCH_COMMENT_WAKE_LIMIT = 10;
/** One check after a burst of webhooks (several check suites finish together). */
export const PR_WATCH_DEBOUNCE_MS = 60_000;
/** A PR GitHub cannot read for this long ends the watch. */
export const PR_WATCH_UNREADABLE_MS = 15 * 60_000;
/** Retry delay after a failed read or send. */
export const PR_WATCH_RETRY_MS = 2 * 60_000;
const LISTED_CHECKS = 10;

export interface WatchedCheck {
  name: string;
  state: "pending" | "passed" | "failed";
  /** GitHub's word for a failure that is not a plain "failure" (cancelled, …). */
  conclusion: string | null;
  required: boolean;
  url: string | null;
}

export type Mergeability = "mergeable" | "conflicting" | "unknown";

/** The PR as GitHub reports it now. */
export interface PrSnapshot {
  headSha: string;
  checks: ReadonlyArray<WatchedCheck>;
  mergeability: Mergeability;
  /** Trusted human comments newer than the watch's `remarksThrough`. */
  remarks: ReadonlyArray<FeedbackItem>;
  /** GitHub time of the newest of `remarks`, null when there are none. */
  remarksNewestAt: number | null;
}

export type PrWatchChange =
  | { kind: "checks_failed"; failed: ReadonlyArray<WatchedCheck> }
  | { kind: "checks_passed"; count: number; required: boolean }
  | { kind: "remarks"; remarks: ReadonlyArray<FeedbackItem> }
  | { kind: "conflicting" };

export interface PrWatchReport {
  /** What the agent has not been told yet. Empty means no wake. */
  changes: PrWatchChange[];
  /** The watch to store, whether or not anything is reported. */
  next: PrWatch;
  /** This wake spends the last one before the cap, so the watch ends after it. */
  exhausted: boolean;
}

/**
 * PRs a webhook may have changed for a watch: a check suite that completed,
 * whatever its conclusion, or trusted human feedback. Reuses the automation
 * parse, so bot senders (Eva's own agent included) and untrusted commenters
 * never count. Commit statuses name branches, not PRs: see `noteHeadStatus`.
 */
export function prWatchUrls(
  events: ReadonlyArray<RepoEvent>,
  ci: CiCompleted | null,
): string[] {
  const urls = new Set<string>();
  for (const event of events) {
    if (event.kind === "pr_feedback") urls.add(event.prUrl);
  }
  if (ci?.kind === "check_suite") {
    for (const prUrl of ci.prUrls) urls.add(prUrl);
  }
  return [...urls];
}

/** A new watch: only what happens from now on is reported. */
export function newPrWatch(now: number, sessionChatId?: PrWatch["sessionChatId"]): PrWatch {
  return {
    startedAt: now,
    ...(sessionChatId === undefined ? {} : { sessionChatId }),
    failedChecks: [],
    passed: false,
    conflicting: false,
    remarksThrough: now,
    commentWakes: 0,
  };
}

/**
 * Compares the PR with what the agent was last told. Each check is reported as
 * soon as it fails, so one slow check cannot hold the news back. "Passed" is
 * reported once the required checks all passed, or every check when none is
 * required. A new head commit starts the check record over. The first read
 * (no `headSha` yet) only records the baseline, plus any new comments.
 */
export function evaluatePrWatch(
  watch: PrWatch,
  snapshot: PrSnapshot,
): PrWatchReport {
  const changes: PrWatchChange[] = [];
  const headMoved = snapshot.headSha !== watch.headSha;

  let failedChecks = headMoved ? [] : watch.failedChecks;
  let passed = headMoved ? false : watch.passed;
  // No checks at all keeps the last state: GitHub may not have queued them yet.
  if (snapshot.checks.length > 0) {
    const failed = snapshot.checks.filter((check) => check.state === "failed");
    const newlyFailed = failed.filter(
      (check) => !failedChecks.includes(check.name),
    );
    if (newlyFailed.length > 0) {
      changes.push({ kind: "checks_failed", failed: newlyFailed });
    }
    // A check that runs again leaves the list, so failing again is news.
    failedChecks = failed.map((check) => check.name);

    const required = snapshot.checks.filter((check) => check.required);
    const gate = required.length > 0 ? required : snapshot.checks;
    const passedNow = gate.every((check) => check.state === "passed");
    if (passedNow && !passed) {
      changes.push({
        kind: "checks_passed",
        count: gate.length,
        required: required.length > 0,
      });
    }
    passed = passedNow;
  }

  if (snapshot.remarks.length > 0) {
    changes.push({ kind: "remarks", remarks: snapshot.remarks });
  }

  if (snapshot.mergeability === "conflicting" && !watch.conflicting) {
    changes.push({ kind: "conflicting" });
  }
  // The first read is the baseline: checks and conflicts that were already
  // there when the watch started are not news. Comments are, since the cursor
  // starts at the watch's start.
  const reported =
    watch.headSha === undefined
      ? changes.filter((change) => change.kind === "remarks")
      : changes;
  // "unknown" is GitHub still computing; only a clear answer changes the state.
  const conflicting =
    snapshot.mergeability === "unknown"
      ? watch.conflicting
      : snapshot.mergeability === "conflicting";

  const commentsOnly =
    reported.length > 0 &&
    reported.every((change) => change.kind === "remarks");
  const progress = headMoved || (reported.length > 0 && !commentsOnly);
  const commentWakes =
    (progress ? 0 : watch.commentWakes) + (commentsOnly ? 1 : 0);

  return {
    changes: reported,
    next: {
      startedAt: watch.startedAt,
      ...(watch.sessionChatId === undefined
        ? {}
        : { sessionChatId: watch.sessionChatId }),
      headSha: snapshot.headSha,
      failedChecks,
      passed,
      conflicting,
      remarksThrough: Math.max(
        watch.remarksThrough,
        snapshot.remarksNewestAt ?? 0,
      ),
      commentWakes,
    },
    exhausted: commentsOnly && commentWakes >= PR_WATCH_COMMENT_WAKE_LIMIT,
  };
}

function checkLine(check: WatchedCheck): string {
  const how =
    check.conclusion === null || check.conclusion === "failure"
      ? ""
      : ` (${check.conclusion})`;
  const link = check.url === null ? "" : ` ([details](${check.url}))`;
  // Check names come from workflow files a PR can edit: keep each on one line.
  const name = check.name.replace(/\s+/g, " ").trim();
  return `  - ${name}${how}${link}`;
}

function changeLines(
  change: PrWatchChange,
  context: { baseBranch: string; commit: string },
): string[] {
  switch (change.kind) {
    case "checks_failed": {
      const lines = change.failed.slice(0, LISTED_CHECKS).map(checkLine);
      if (change.failed.length > LISTED_CHECKS) {
        lines.push(`  - and ${change.failed.length - LISTED_CHECKS} more`);
      }
      return [`- Checks failed${context.commit}:`, ...lines];
    }
    case "checks_passed": {
      const noun = change.count === 1 ? "check" : "checks";
      const which = change.required ? "required " : "";
      return [
        `- All ${change.count} ${which}${noun} passed${context.commit}.`,
      ];
    }
    case "remarks":
      return [
        `- ${change.remarks.length} new ${change.remarks.length === 1 ? "comment" : "comments"} (quoted below).`,
      ];
    case "conflicting":
      return [`- The branch now conflicts with \`${context.baseBranch}\`.`];
  }
}

/** The message that wakes the agent. */
export function buildPrWatchMessage(params: {
  prNumber: number;
  prUrl: string;
  baseBranch: string;
  headSha: string;
  report: PrWatchReport;
}): string {
  const { prNumber, prUrl, baseBranch, headSha, report } = params;
  const context = { baseBranch, commit: ` on \`${headSha.slice(0, 7)}\`` };
  const remarks = report.changes.flatMap((change) =>
    change.kind === "remarks" ? change.remarks : [],
  );
  const closing = report.exhausted
    ? `Eva stopped watching after ${PR_WATCH_COMMENT_WAKE_LIMIT} comment-only updates in a row. Call \`watch_pull_request\` to watch it again.`
    : "Look into each item and act on it as your task requires. Eva keeps watching and wakes you on the next change, so end your turn when you are done. Call `unwatch_pull_request` when you no longer need updates.";
  return capLength(
    [
      [
        `**Update on #${prNumber}** (${prUrl}), which Eva is watching for you:`,
        ...report.changes.flatMap((change) => changeLines(change, context)),
      ].join("\n"),
      ...(remarks.length > 0 ? [quoteFeedback(remarks)] : []),
      closing,
    ].join("\n\n"),
  );
}
