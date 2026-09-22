"use client";

import { m } from "motion/react";
import { Button, Surface, motionBase } from "@eva/ui";
import {
  IconGitMerge,
  IconGitPullRequestClosed,
} from "@tabler/icons-react";
import { formatExactDateTime } from "@eva/shared/dates";
import { shortSha, type PrOverview } from "./prOverviewMeta";

/**
 * The two ends a pull request can reach. An open one has not had an event yet,
 * so it gets no row — which is why this is a separate type from
 * `PrOverview["status"]` rather than a filter at the call site.
 */
export type PrLifecycleStatus = "merged" | "closed";

/**
 * How the pull request ended, stated once at the head of the conversation.
 *
 * This is the first thing a reader wants to know and the last thing the rail
 * would tell them: chronologically the merge lands after every comment, so on a
 * long thread the answer to "did this ship?" was a scroll away. It leads instead.
 *
 * A card with the verdict on its own line and the detail under it, because that
 * detail is a sentence and not a label — it used to be a single wrapping notice
 * line where "Merged" was the first of eleven words rather than the answer. The
 * merge commit is the one thing a reader wants next, so it ends the row as a
 * control rather than as another clause.
 *
 * An exact timestamp, not a relative one: everything else on this surface is
 * "17h ago" because it is still moving, and this is the one event a reader might
 * quote in an incident channel.
 */
export function PrLifecycleEventCard({
  status,
  overview,
}: {
  status: PrLifecycleStatus;
  overview: PrOverview;
}) {
  const merged = status === "merged";
  const sha = overview.mergeCommitSha;
  const commitUrl =
    sha === null ? null : `${overview.htmlUrl}/commits/${sha}`;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionBase}
    >
      <Surface density="tight" className="flex min-w-0 items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {merged ? (
            <IconGitMerge size={15} aria-hidden />
          ) : (
            <IconGitPullRequestClosed size={15} aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">{merged ? "Merged" : "Closed"}</p>
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            <Detail status={status} overview={overview} />
          </p>
        </div>

        {commitUrl === null ? null : (
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <a href={commitUrl} target="_blank" rel="noopener noreferrer">
              View commit
            </a>
          </Button>
        )}
      </Surface>
    </m.div>
  );
}

/**
 * Only what the payload actually carries. There is no close timestamp and no
 * closer on the overview, so the closed line names neither rather than guessing.
 */
function Detail({
  status,
  overview,
}: {
  status: PrLifecycleStatus;
  overview: PrOverview;
}) {
  if (status === "closed") return <>Closed without merging.</>;

  const sha = overview.mergeCommitSha;
  return (
    <>
      {overview.mergedByLogin === null ? "Merged" : null}
      {overview.mergedByLogin === null ? null : (
        <span className="font-medium text-foreground">
          {overview.mergedByLogin}
        </span>
      )}
      {overview.mergedByLogin === null ? " " : " merged "}
      {sha === null ? null : (
        <>
          {"commit "}
          <span className="font-mono">{shortSha(sha)}</span>{" "}
        </>
      )}
      {"into "}
      <span className="font-mono">{overview.baseRef}</span>
      {overview.mergedAt === null ? null : (
        <>
          {" on "}
          {formatExactDateTime(new Date(overview.mergedAt).getTime())}
        </>
      )}
    </>
  );
}
