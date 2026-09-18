"use client";

import type { Id } from "@eva/backend";
import { Button, Spinner, Surface, cn } from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { usePrCommits } from "../usePrOverview";
import { PrCommitRow } from "./PrCommitRow";
import { NOTICE_CLASS, type PrOverview } from "./prOverviewMeta";

/**
 * The Commits tab: every commit on the branch, newest work reachable, each row
 * opening that commit's diff.
 *
 * A flat list, not the Activity rail's push groups. On the rail a group answers
 * "what happened next"; here the reader is auditing the branch, so one column of
 * sha / message / author / time reads faster than headings that repeat the author
 * on every group.
 *
 * The overview carries GitHub's first commit page, which is the *oldest* — so a
 * long branch hides its most recent work until Load more runs. It is not loaded
 * on mount because up to 250 commits is a real request, and the reader who cares
 * asks for it.
 */
export function PrCommitsPanel({
  repoId,
  overview,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
}) {
  const allCommits = usePrCommits(repoId, overview.number);
  const commits = allCommits.commits ?? overview.commits;
  const hidden = Math.max(0, overview.commitCount - commits.length);
  const canLoad = allCommits.commits === undefined && hidden > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
        <Surface density="none" className="overflow-hidden py-1">
          <ul>
            {commits.map((commit, index) => (
              <li key={commit.sha} className="min-w-0">
                <ListEnter index={index} fast>
                  <PrCommitRow repoId={repoId} commit={commit} showAuthor />
                </ListEnter>
              </li>
            ))}
          </ul>
        </Surface>

        {canLoad ? (
          <div
            className={cn(
              NOTICE_CLASS,
              "flex flex-wrap items-center justify-between gap-2",
            )}
          >
            <span>
              {hidden} more recent {hidden === 1 ? "commit is" : "commits are"}{" "}
              not shown.
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

        {allCommits.truncated ? (
          <p className={NOTICE_CLASS}>
            GitHub serves at most 250 commits for a pull request, so the oldest
            are not shown.
          </p>
        ) : null}
      </div>
    </div>
  );
}
