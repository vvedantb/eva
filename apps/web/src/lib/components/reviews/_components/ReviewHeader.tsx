"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Id } from "@eva/backend";
import { cn } from "@eva/ui";
import {
  IconArrowNarrowLeft,
  IconExternalLink,
  IconFileDiff,
} from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { headerBlocker } from "./prMergeState";
import { PrHeaderActions } from "./PrHeaderActions";
import { PrRemedyButton } from "./PrRemedyButton";
import {
  PrAvatar,
  PrCopyableCode,
  PrDiffStat,
  PrMetaLine,
} from "./prReviewParts";
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
 * The chrome above every review tab, laid out as t3code's pull request panel:
 *
 * 1. A thin top row — repository, the number in the pull request's state colour
 *    (a link to GitHub), and the actions on the right.
 * 2. A fold — the title, who opened it and when, the checkout command, then
 *    base ← head with the size of the change.
 * 3. The tab row (`nav`), supplied by the panel.
 *
 * Once the reader scrolls past the fold it collapses (`condensed`) and the top
 * row takes the title instead, so the tab row and actions stay on screen without
 * the fold eating a third of a narrow pane.
 */
export function ReviewHeader({
  repoId,
  overview,
  condensed,
  refreshing,
  onRefresh,
  onChanged,
  nav,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  condensed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** Re-reads the overview after an action changed the pull request on GitHub. */
  onChanged: () => void;
  nav: ReactNode;
}) {
  const { basePath, owner, name } = useRepo();
  const state = statusMeta(overview.status, overview.draft);
  const StateIcon = state.icon;
  const blocker = headerBlocker(overview);

  const number = (
    <a
      href={overview.htmlUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline",
        state.textClassName,
      )}
      aria-label={`${state.label} pull request #${overview.number}, open on GitHub`}
      title={`${state.label} · open on GitHub`}
    >
      <StateIcon size={13} aria-hidden />#{overview.number}
      <IconExternalLink size={10} aria-hidden className="opacity-70" />
    </a>
  );

  return (
    <div className="@container/pr-header shrink-0 border-b border-border">
      <div className="flex h-10 min-w-0 items-center gap-2 px-4">
        {/* Both identities share one cell and cross-fade, so the actions on the
            right never move when the fold collapses. */}
        <div className="grid min-w-0 flex-1 items-center">
          <div
            aria-hidden={condensed}
            inert={condensed}
            className={cn(
              "col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground transition-[opacity,transform] duration-150 ease-out",
              condensed && "pointer-events-none -translate-y-1 opacity-0",
            )}
          >
            <Link
              to={toInternalRepoHref(`${basePath}/reviews`)}
              className="min-w-0 truncate font-medium transition-colors hover:text-foreground"
            >
              {owner}/{name}
            </Link>
            {number}
          </div>
          <div
            aria-hidden={!condensed}
            inert={!condensed}
            className={cn(
              "col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 text-xs transition-[opacity,transform] duration-150 ease-out",
              !condensed && "pointer-events-none translate-y-1 opacity-0",
            )}
          >
            {number}
            <span className="min-w-0 truncate font-medium" title={overview.title}>
              {overview.title}
            </span>
          </div>
        </div>
        <PrHeaderActions
          repoId={repoId}
          overview={overview}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onChanged={onChanged}
        />
      </div>

      {/* Collapse before the scroll refund paints; only reopening eases back. */}
      <div
        className={cn(
          "grid",
          condensed
            ? "grid-rows-[0fr]"
            : "grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={condensed}>
          <div className="min-w-0 px-4 pb-3">
            <h1
              className="truncate text-base font-semibold leading-snug"
              title={overview.title}
            >
              {overview.title}
            </h1>

            <div className="mt-1.5 flex min-h-5 min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <PrMetaLine className="min-w-0 whitespace-nowrap">
                <span className="flex min-w-0 items-center gap-1.5">
                  <PrAvatar
                    login={overview.authorLogin}
                    avatarUrl={overview.authorAvatarUrl}
                  />
                  <span className="truncate font-medium text-foreground">
                    {overview.authorLogin ?? "Someone"}
                  </span>
                </span>
                <span>
                  updated{" "}
                  <RelativeDateTime at={new Date(overview.updatedAt).getTime()} />{" "}
                  ago
                </span>
              </PrMetaLine>
              <PrCopyableCode
                value={`gh pr checkout ${overview.number}`}
                label="Checkout command"
                className="ml-auto max-w-[45%] text-xs @max-[28rem]/pr-header:hidden"
              />
            </div>

            <div className="mt-3 flex min-h-5 min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {/* Target on the left, as the arrow reads: this branch goes into
                  that one. Head refs are generated and long, so they give up
                  width first. */}
              <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono">
                <span className="max-w-[40%] shrink-0 truncate" title={overview.baseRef}>
                  {overview.baseRef}
                </span>
                <IconArrowNarrowLeft
                  size={14}
                  className="shrink-0 opacity-60"
                  aria-label="receives changes from"
                />
                <PrCopyableCode value={overview.headRef} label="Branch name" />
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <IconFileDiff size={13} aria-hidden />
                  {overview.changedFiles.toLocaleString()}{" "}
                  {overview.changedFiles === 1 ? "file" : "files"}
                </span>
                <PrDiffStat
                  additions={overview.additions}
                  deletions={overview.deletions}
                />
              </span>
            </div>

            {blocker === null ? null : (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
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
        </div>
      </div>

      {nav}
    </div>
  );
}
