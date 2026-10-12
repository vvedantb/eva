import type {
  PrComment,
  PrCommit,
  PrOverview,
  PrReviewEvent,
} from "./prOverviewMeta";

/**
 * One thing that happened to the pull request, as t3code's Timeline reads it.
 * Remarks are events too, but consecutive ones are folded into a single
 * conversation row (`TimelineRow`) so a run of bot comments reads as one entry.
 */
export type TimelineEvent =
  | { readonly kind: "opened"; readonly key: string; readonly at: number }
  | {
      readonly kind: "commit";
      readonly key: string;
      readonly at: number;
      readonly commit: PrCommit;
    }
  | {
      readonly kind: "comment";
      readonly key: string;
      readonly at: number;
      readonly comment: PrComment;
    }
  | {
      /** A review summary with no verdict — just something said. */
      readonly kind: "review-comment";
      readonly key: string;
      readonly at: number;
      readonly review: PrReviewEvent;
    }
  | {
      readonly kind: "verdict";
      readonly key: string;
      readonly at: number;
      readonly review: PrReviewEvent;
      /** Commits landed after it, so it speaks for code the branch no longer has. */
      readonly stale: boolean;
    }
  | {
      readonly kind: "merged" | "closed";
      readonly key: string;
      readonly at: number;
      readonly actor: string | null;
    };

export type ConversationEvent = Extract<
  TimelineEvent,
  { kind: "comment" | "review-comment" }
>;

export type TimelineRow =
  | { readonly kind: "conversation"; readonly key: string; readonly events: readonly ConversationEvent[] }
  | { readonly kind: "event"; readonly key: string; readonly event: Exclude<TimelineEvent, ConversationEvent> };

const VERDICTS = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

/**
 * Within one timestamp: the opening first, pushes before what was said about
 * them, a verdict before the remarks that are not part of it, and the merge last.
 */
const KIND_RANK: Record<TimelineEvent["kind"], number> = {
  opened: 0,
  commit: 1,
  verdict: 2,
  "review-comment": 3,
  comment: 4,
  merged: 5,
  closed: 5,
};

function timestamp(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Flattens the overview into events, oldest first. The opening and the merge
 * are events here (t3code draws both on the rail); the description is not — it
 * lives in Summary.
 */
export function buildPrTimeline(overview: PrOverview): TimelineEvent[] {
  const newestCommitAt = Math.max(
    0,
    ...overview.commits.map((commit) => timestamp(commit.committedAt)),
  );

  const events: TimelineEvent[] = [
    { kind: "opened", key: "opened", at: timestamp(overview.createdAt) },
    ...overview.commits.map(
      (commit): TimelineEvent => ({
        kind: "commit",
        key: `commit-${commit.sha}`,
        at: timestamp(commit.committedAt),
        commit,
      }),
    ),
    ...overview.comments.map(
      (comment): TimelineEvent => ({
        kind: "comment",
        key: `comment-${comment.kind}-${comment.id}`,
        at: timestamp(comment.createdAt),
        comment,
      }),
    ),
    ...overview.reviewEvents.flatMap((review): TimelineEvent[] => {
      const at = timestamp(review.submittedAt);
      if (VERDICTS.has(review.state)) {
        return [
          {
            kind: "verdict",
            key: `review-${review.id}`,
            at,
            review,
            stale: at > 0 && newestCommitAt > at,
          },
        ];
      }
      // An empty shell (inline comments, no summary) says nothing on its own;
      // its inline comments are already events.
      if (review.body.trim().length === 0) return [];
      return [{ kind: "review-comment", key: `review-${review.id}`, at, review }];
    }),
  ];

  if (overview.status === "merged") {
    events.push({
      kind: "merged",
      key: "merged",
      at: timestamp(overview.mergedAt),
      actor: overview.mergedByLogin,
    });
  } else if (overview.status === "closed") {
    // GitHub's overview carries no close time; the last update is the close.
    events.push({
      kind: "closed",
      key: "closed",
      at: timestamp(overview.updatedAt),
      actor: null,
    });
  }

  return events.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

function isConversation(event: TimelineEvent): event is ConversationEvent {
  return event.kind === "comment" || event.kind === "review-comment";
}

/**
 * Folds each run of adjacent remarks into one conversation row. Anything else
 * in between — a push, a verdict — splits the run, so the rail still reads in
 * order.
 */
export function groupTimelineRows(
  events: readonly TimelineEvent[],
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let run: ConversationEvent[] = [];
  const flush = () => {
    const first = run[0];
    if (first !== undefined) {
      rows.push({ kind: "conversation", key: `conversation-${first.key}`, events: run });
    }
    run = [];
  };
  for (const event of events) {
    if (isConversation(event)) {
      run.push(event);
      continue;
    }
    flush();
    rows.push({ kind: "event", key: event.key, event });
  }
  flush();
  return rows;
}
