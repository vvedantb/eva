"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { CircleSpinner } from "@eva/ui";
import {
  IconCircleCheck,
  IconCircleX,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconGitPullRequestDraft,
  IconMessageCircle,
  IconMinus,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

/**
 * Convex is the single source of truth for the Overview shape — every card
 * below indexes into this type rather than restating fields.
 */
export type PrOverview = FunctionReturnType<
  typeof api.github.getPullRequestOverview
>;
export type PrCheck = PrOverview["checks"][number];
export type PrReviewEvent = PrOverview["reviewEvents"][number];
export type PrCommit = PrOverview["commits"][number];
export type PrComment = PrOverview["comments"][number];
export type PrLabel = PrOverview["labels"][number];
export type PrActor = PrOverview["assignees"][number];

export type StatusTone = "success" | "failure" | "pending" | "neutral";

/** Maps a check run or commit status onto one of four visual tones. */
export function checkTone(check: PrCheck): StatusTone {
  if (check.status !== "completed") return "pending";
  if (check.conclusion === "success") return "success";
  if (
    check.conclusion === "failure" ||
    check.conclusion === "timed_out" ||
    check.conclusion === "cancelled" ||
    check.conclusion === "action_required"
  ) {
    return "failure";
  }
  return "neutral";
}

export function ToneIcon({
  tone,
  size = 14,
}: {
  tone: StatusTone;
  size?: number;
}) {
  if (tone === "pending") {
    return (
      <CircleSpinner
        size="sm"
        style={{ width: size, height: size }}
        className="shrink-0"
      />
    );
  }
  if (tone === "success") {
    return (
      <IconCircleCheck
        size={size}
        className="shrink-0 text-emerald-600 dark:text-emerald-400"
      />
    );
  }
  if (tone === "failure") {
    return <IconCircleX size={size} className="shrink-0 text-destructive" />;
  }
  return <IconMinus size={size} className="shrink-0 text-muted-foreground" />;
}

/**
 * The lifecycle in one table — wording, colour, and glyph — so the header's
 * state-coloured number cannot pair one state's word with another's tone.
 */
export function statusMeta(
  status: PrOverview["status"],
  draft: boolean,
): { label: string; className: string; textClassName: string; icon: TablerIcon } {
  if (status === "merged") {
    return {
      label: "Merged",
      className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      textClassName: "text-violet-700 dark:text-violet-300",
      icon: IconGitMerge,
    };
  }
  if (status === "closed") {
    return {
      label: "Closed",
      className: "bg-destructive/10 text-destructive",
      textClassName: "text-destructive",
      icon: IconGitPullRequestClosed,
    };
  }
  if (draft) {
    return {
      label: "Draft",
      className: "bg-muted/60 text-muted-foreground",
      textClassName: "text-muted-foreground",
      icon: IconGitPullRequestDraft,
    };
  }
  return {
    label: "Open",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    textClassName: "text-emerald-700 dark:text-emerald-300",
    icon: IconGitPullRequest,
  };
}

/**
 * The one structural device on the review surface: a quiet label naming a region
 * of the document. Regions are separated by this plus whitespace, never by a box —
 * a review reads as one page, not a stack of cards.
 *
 * Sentence case, not the tracked-out uppercase this used to be. Five uppercase
 * headings down a 224px column read as a form to fill in; these are labels on
 * reference material, and at this size caps also cost the descenders that make
 * "Assignees" and "Reviewers" distinguishable at a glance.
 */
export const SECTION_LABEL_CLASS =
  "shrink-0 text-xs font-medium text-muted-foreground";

/** Shared idiom for a quiet, non-blocking notice (truncation, empty states). */
export const NOTICE_CLASS =
  "rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground";

/**
 * Review states as GitHub words them, plus the tone that drives the icon.
 * "Commented" is deliberately neutral — it neither blocks nor unblocks.
 */
export function reviewStateMeta(state: string): {
  label: string;
  tone: StatusTone;
} {
  if (state === "APPROVED") return { label: "Approved", tone: "success" };
  if (state === "CHANGES_REQUESTED") {
    return { label: "Requested changes", tone: "failure" };
  }
  if (state === "DISMISSED") return { label: "Dismissed", tone: "neutral" };
  if (state === "PENDING") return { label: "Pending", tone: "pending" };
  return { label: "Commented", tone: "neutral" };
}

export function ReviewStateIcon({ state }: { state: string }) {
  if (state === "COMMENTED") {
    return (
      <IconMessageCircle size={14} className="shrink-0 text-muted-foreground" />
    );
  }
  return <ToneIcon tone={reviewStateMeta(state).tone} />;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Text size for GitHub-authored markdown (description, comments). */
export const MARKDOWN_CLASS = "text-sm";
