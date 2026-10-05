"use client";

import type { Id } from "@eva/backend";
import { Button, Spinner } from "@eva/ui";
import { IconGitPullRequest } from "@tabler/icons-react";
import { usePrCommits } from "./usePrOverview";
import { NOTICE_CLASS, type PrOverview } from "./_components/prOverviewMeta";
import {
  TimelineCommit,
  TimelineConversation,
  TimelineLifecycle,
  TimelineVerdict,
} from "./_components/TimelineRows";
import { buildPrTimeline, groupTimelineRows } from "./_components/prTimelineItems";
import type { TimelineOrder } from "./_components/ReviewTabNav";

/**
 * The Timeline tab, as t3code draws it: one rail down the left, every event a
 * row on it — the opening, each push, each verdict, the merge — and each run of
 * remarks folded into one conversation row that opens in place.
 *
 * A commit row opens the Code tab scoped to that commit, so "what did this push
 * change" is one click from the rail.
 */
export function ReviewTimelineTab({
  repoId,
  overview,
  order,
  onOpenCommit,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  order: TimelineOrder;
  onOpenCommit: (sha: string) => void;
}) {
  // The overview carries GitHub's first page of commits, which is the oldest —
  // so a long branch hides its most recent work until Load more fetches it.
  const allCommits = usePrCommits(repoId, overview.number);
  const commits = allCommits.commits ?? overview.commits;
  const events = buildPrTimeline({ ...overview, commits });
  const rows = groupTimelineRows(order === "newest" ? [...events].reverse() : events);
  const hiddenCommits = Math.max(0, overview.commitCount - commits.length);
  const canLoadCommits = allCommits.commits === undefined && hiddenCommits > 0;

  const loadMore = canLoadCommits ? (
    <div className={`${NOTICE_CLASS} mb-5 ml-12 flex flex-wrap items-center justify-between gap-2`}>
      <span>
        {hiddenCommits} more recent {hiddenCommits === 1 ? "commit is" : "commits are"} not
        shown.
      </span>
      <Button
        size="xs"
        variant="secondary"
        onClick={allCommits.load}
        disabled={allCommits.loading}
      >
        {allCommits.loading ? <Spinner size="sm" /> : null}
        Load more commits
      </Button>
    </div>
  ) : null;

  return (
    <div className="h-full overflow-y-auto px-4 py-5 pb-20">
      <div className="mx-auto max-w-3xl">
        {order === "newest" ? loadMore : null}
        <div className="relative">
          <span
            aria-hidden
            className="absolute top-1 bottom-5 left-[15px] w-px bg-border"
          />
          {rows.map((row) => {
            if (row.kind === "conversation") {
              return <TimelineConversation key={row.key} events={row.events} />;
            }
            const { event } = row;
            if (event.kind === "commit") {
              return (
                <TimelineCommit
                  key={row.key}
                  commit={event.commit}
                  onOpen={() => onOpenCommit(event.commit.sha)}
                />
              );
            }
            if (event.kind === "verdict") {
              return (
                <TimelineVerdict
                  key={row.key}
                  review={event.review}
                  stale={event.stale}
                />
              );
            }
            return (
              <TimelineLifecycle
                key={row.key}
                kind={event.kind}
                at={event.at}
                actor={
                  event.kind === "opened" ? overview.authorLogin : event.actor
                }
              />
            );
          })}
        </div>
        {order === "oldest" ? loadMore : null}
        {allCommits.error === null ? null : (
          <p className="ml-12 text-xs text-destructive">{allCommits.error}</p>
        )}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <IconGitPullRequest size={20} className="mb-2" aria-hidden />
            <p className="text-xs">No activity yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
