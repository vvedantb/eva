"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { Spinner, cn } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
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
      <Spinner
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
 * The lifecycle, always stated. Open used to render nothing on the grounds that it
 * is the common case, but the pill sits immediately left of the title now: a slot
 * that is empty nine times in ten reads as a missing thing rather than a saved
 * one, and the title shifted left or right depending on the PR it belonged to.
 * One pill, four states, same position.
 */
function statusMeta(
  status: PrOverview["status"],
  draft: boolean,
): { label: string; className: string; icon: TablerIcon } {
  if (status === "merged") {
    return {
      label: "Merged",
      className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      icon: IconGitMerge,
    };
  }
  if (status === "closed") {
    return {
      label: "Closed",
      className: "bg-destructive/10 text-destructive",
      icon: IconGitPullRequestClosed,
    };
  }
  if (draft) {
    return {
      label: "Draft",
      className: "bg-muted/60 text-muted-foreground",
      icon: IconGitPullRequestDraft,
    };
  }
  return {
    label: "Open",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: IconGitPullRequest,
  };
}

/**
 * The lifecycle pill itself. Rendered from `statusMeta` rather than beside it, so
 * a surface cannot pair one status's wording with another's colour, icon, or tone.
 */
export function PrStatusPill({
  status,
  draft,
  className,
}: {
  status: PrOverview["status"];
  draft: boolean;
  className?: string;
}) {
  const meta = statusMeta(status, draft);
  const Icon = meta.icon;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={`${status}-${draft}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.075, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex"
      >
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
            meta.className,
            className,
          )}
        >
          <Icon size={12} aria-hidden />
          {meta.label}
        </span>
      </m.span>
    </AnimatePresence>
  );
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

/** Shared prose styling for GitHub-authored markdown (description, comments). */
// `[&_pre]:overflow-x-auto`: a PR body's code fence is often wider than a phone,
// and it used to push the whole column sideways instead of scrolling itself.
export const MARKDOWN_CLASS =
  "prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 max-sm:[&_pre]:overflow-x-auto";
