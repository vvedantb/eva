"use client";

import type { ReactNode } from "react";
import type { Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { IconArrowNarrowRight, IconArrowUpRight } from "@tabler/icons-react";
import { headerBlocker } from "./prMergeState";
import { PrHeaderActions } from "./PrHeaderActions";
import { PrRemedyButton } from "./PrRemedyButton";
import {
  ToneIcon,
  statusMeta,
  type PrOverview,
  type StatusTone,
} from "./prOverviewMeta";

const BLOCKER_TONE_CLASS: Record<StatusTone, string> = {
  failure: "text-destructive",
  pending: "text-muted-foreground",
  neutral: "text-muted-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
};

/**
 * The chrome above every review tab, as simple as Cursor's: one line with the
 * state pill, `head → base` and the actions; then the title with its number
 * linking out to GitHub; then the tab row. A blocker (conflicts, failing
 * checks) adds one more line only when there is one.
 */
export function ReviewHeader({
  repoId,
  overview,
  refreshing,
  onRefresh,
  onChanged,
  nav,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
  /** Re-reads the overview after an action changed the pull request on GitHub. */
  onChanged: () => void;
  nav: ReactNode;
}) {
  const state = statusMeta(overview.status, overview.draft);
  const StateIcon = state.icon;
  const blocker = headerBlocker(overview);

  return (
    <div className="shrink-0 border-b border-border">
      <div className="space-y-2 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium",
              state.className,
            )}
          >
            <StateIcon size={14} aria-hidden />
            {state.label}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="min-w-0 truncate" title={overview.headRef}>
              {overview.headRef}
            </span>
            <IconArrowNarrowRight
              size={14}
              aria-label="merges into"
              className="shrink-0"
            />
            <span className="shrink-0">{overview.baseRef}</span>
          </span>
          <PrHeaderActions
            repoId={repoId}
            overview={overview}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onChanged={onChanged}
          />
        </div>

        <h1 className="text-lg leading-snug font-medium">
          {overview.title}{" "}
          <a
            href={overview.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-normal whitespace-nowrap text-muted-foreground hover:text-foreground"
            aria-label={`Pull request #${overview.number} on GitHub`}
          >
            #{overview.number}
            <IconArrowUpRight size={16} aria-hidden />
          </a>
        </h1>

        {blocker === null ? null : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-xs font-medium",
                BLOCKER_TONE_CLASS[blocker.tone],
              )}
            >
              <ToneIcon tone={blocker.tone} size={13} />
              {blocker.label}
            </span>
            {blocker.remedy === null ? null : (
              <span className="ml-auto">
                <PrRemedyButton
                  remedy={blocker.remedy}
                  headRef={overview.headRef}
                  tone={blocker.tone}
                />
              </span>
            )}
          </div>
        )}
      </div>

      {nav}
    </div>
  );
}
