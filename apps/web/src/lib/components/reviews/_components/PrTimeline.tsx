"use client";

import type { ReactNode } from "react";
import type { Id } from "@eva/backend";
import { Button, Spinner, cn, motionFast } from "@eva/ui";
import { m } from "motion/react";
import { IconGitCommit } from "@tabler/icons-react";
import { usePrCommits } from "../usePrOverview";
import { PrCommentBubble } from "./PrCommentBubble";
import { PrCommitGroup } from "./PrCommitGroup";
import { PrReviewEventItem } from "./PrReviewEventItem";
import {
  NOTICE_CLASS,
  ReviewStateIcon,
  type PrOverview,
} from "./prOverviewMeta";
import { buildPrTimeline } from "./prTimelineItems";

/**
 * The conversation: everything that happened to the pull request, in order. The
 * vertical rail and the 32px gutter are owned here, so comments, review verdicts,
 * and commits all line up however they are composed.
 *
 * Neither the description nor the merge event is a row on this rail: both sit
 * above it (see `ReviewOverviewPanel`), because a long agent-written description
 * would bury the replies and the merge lands chronologically last when it is the
 * first thing a reader wants to know.
 */
export function PrTimeline({
  repoId,
  overview,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
}) {
  // The overview carries GitHub's first page of commits, which is the oldest —
  // so what a long branch hides is its most recent work, and Load more fetches
  // the rest rather than sending the reader to GitHub.
  const allCommits = usePrCommits(repoId, overview.number);
  const commits = allCommits.commits ?? overview.commits;
  const items = buildPrTimeline({ ...overview, commits });

  const hiddenCommits = Math.max(0, overview.commitCount - commits.length);
  const canLoadCommits = allCommits.commits === undefined && hiddenCommits > 0;
  // Only what Load more cannot fix is worth a link out: capped comment pages, or
  // a branch past GitHub's own commit ceiling.
  const incomplete =
    overview.commentsTruncated ||
    (allCommits.commits !== undefined &&
      (allCommits.truncated || hiddenCommits > 0));

  return (
    <div className="relative min-w-0 space-y-3">
      <span
        aria-hidden
        className="absolute inset-y-4 left-4 w-px bg-border"
        // The rail is decoration behind the gutter; every avatar masks it with a
        // background ring so it reads as a thread rather than a strikethrough.
      />

      <ol className="relative flex min-w-0 flex-col gap-4">
        {items.map((item) => {
          if (item.kind === "commits") {
            return (
              <TimelineRow
                key={item.key}
                gutter={
                  <TimelineGlyph>
                    <IconGitCommit size={13} aria-hidden />
                  </TimelineGlyph>
                }
              >
                <PrCommitGroup repoId={repoId} commits={item.commits} />
              </TimelineRow>
            );
          }

          if (item.kind === "review") {
            return (
              <TimelineRow
                key={item.key}
                gutter={
                  <span className="relative flex size-8">
                    <TimelineAvatar
                      login={item.review.authorLogin}
                      avatarUrl={item.review.authorAvatarUrl}
                    />
                    <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-background">
                      <ReviewStateIcon state={item.review.state} />
                    </span>
                  </span>
                }
              >
                <PrReviewEventItem item={item} />
              </TimelineRow>
            );
          }

          return (
            <TimelineRow
              key={item.key}
              gutter={
                <TimelineAvatar
                  login={item.comment.authorLogin}
                  avatarUrl={item.comment.authorAvatarUrl}
                />
              }
            >
              <PrCommentBubble
                authorLogin={item.comment.authorLogin}
                action={item.comment.path ? "commented on" : "commented"}
                at={item.comment.createdAt}
                htmlUrl={item.comment.htmlUrl}
                body={item.comment.body}
                path={item.comment.path}
                line={item.comment.line}
              />
            </TimelineRow>
          );
        })}
      </ol>

      {canLoadCommits ? (
        <div
          className={cn(
            NOTICE_CLASS,
            "flex flex-wrap items-center justify-between gap-2",
          )}
        >
          <span>
            {hiddenCommits} more recent{" "}
            {hiddenCommits === 1 ? "commit is" : "commits are"} not shown.
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={allCommits.load}
            disabled={allCommits.loading}
          >
            {allCommits.loading ? <Spinner size="sm" /> : null}
            Load more commits
          </Button>
        </div>
      ) : null}

      {allCommits.error === null ? null : (
        <p className="text-xs text-destructive">{allCommits.error}</p>
      )}

      {incomplete ? (
        <p className={NOTICE_CLASS}>
          Some items are not shown.{" "}
          <a
            href={overview.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            View the full conversation on GitHub
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

function TimelineRow({
  gutter,
  children,
}: {
  gutter: ReactNode;
  children: ReactNode;
}) {
  return (
    <m.li
      className="relative flex min-w-0 gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionFast}
    >
      <span className="relative z-1 shrink-0">{gutter}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </m.li>
  );
}

/**
 * The gutter mark for an event with no author to show — a push, a merge, a close.
 * `ring-background` is the mask that breaks the rail behind the glyph, so the
 * fill needs no outline of its own.
 */
function TimelineGlyph({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background">
        {children}
      </span>
    </span>
  );
}

function TimelineAvatar({
  login,
  avatarUrl,
}: {
  login: string | null;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-8 shrink-0 rounded-full ring-2 ring-background"
      />
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-muted-foreground ring-2 ring-background">
      {login === null ? "?" : login.slice(0, 2)}
    </span>
  );
}
