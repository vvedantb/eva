"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { m } from "motion/react";
import {
  Tabs,
  TabsBar,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  motionFast,
} from "@eva/ui";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { IconGitPullRequest } from "@tabler/icons-react";
import { CountPop } from "@/lib/components/ui/CountPop";
import { isReviewTab, type ReviewTab } from "@/lib/search-params";
import { DiffsPanel } from "@/lib/components/sandbox/DiffsPanel";
import {
  DIFF_HIGHLIGHTER_OPTIONS,
  DIFF_POOL_OPTIONS,
} from "@/lib/components/sandbox/diffWorkerPool";
import { PrRecapPanel } from "@/lib/components/sandbox/PrRecapPanel";
import { ReviewOverviewPanel } from "./ReviewOverviewPanel";
import { usePrOverview } from "./usePrOverview";
import { PrChecksPanel } from "./_components/PrChecksPanel";
import { PrCommitsPanel } from "./_components/PrCommitsPanel";
import { PrTabRail } from "./_components/PrTabRail";
import { ReviewHeader } from "./_components/ReviewHeader";
import {
  REVIEW_TAB_META,
  REVIEW_TAB_ORDER,
  reviewTabCount,
} from "./_components/reviewTabMeta";

interface ReviewTabsPanelProps {
  repoId: Id<"githubRepos">;
  /** Absent until a pull request exists for the work being reviewed. */
  prUrl?: string;
  prNumber?: number;
  activeTab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  /**
   * Rendered as the first row of the shared header — the standalone page puts the
   * PR title here. Padding is supplied here, so pass an unwrapped block.
   */
  header?: ReactNode;
  /**
   * Rendered above `header` as the first line of the surface — the standalone
   * page's repository breadcrumb. Absent in a session, where the sidebar already
   * says which repository and task the reader is in.
   */
  breadcrumb?: ReactNode;
  /**
   * Renews every payload the surface shows, not just the overview — the
   * standalone page also has a title block, read from its own query. Omitted in a
   * session, where the overview is the only payload on the surface.
   */
  refresh?: { run: () => void; running: boolean };
  /**
   * Nested surfaces (session sandbox Review) use `size="sm"` on the same
   * TabsBar / TabsList; the standalone Reviews page keeps the default size.
   */
  compact?: boolean;
}

/**
 * The Activity/Commits/Checks/Changes/Recap tab set, shared by the standalone
 * Reviews page and the sandbox Review tab. Every review surface renders this, so
 * tab order, labels, slugs, empty states, and panel wiring cannot drift between
 * them: the only per-surface concerns are how the active tab is read from the URL
 * and what (if anything) sits above the tab row.
 *
 * The four questions a reviewer arrives with — what was said, what was pushed,
 * what CI thinks, what changed — get a tab each, rather than Commits and Checks
 * being nested inside Activity where each cost a scroll and a disclosure click.
 *
 * Deliberately does not mount `PendingReviewCommentsProvider`: the sandbox
 * shares those pending comments with its chat composer, so the provider has to
 * live above this component, on the surface that owns both.
 */
export function ReviewTabsPanel({
  repoId,
  prUrl,
  prNumber,
  activeTab,
  onTabChange,
  header,
  breadcrumb,
  refresh,
  compact = false,
}: ReviewTabsPanelProps) {
  // Cached hook, so querying here as well as on a surface that needs the recap
  // to pick a default tab costs one request, not two.
  const recapDoc = useQuery(
    api.docs.getRecapByPrUrl,
    prUrl ? { repoId, prUrl } : "skip",
  );
  // Read here rather than inside Overview: the header above the tab row and the
  // Overview tab are two views of one payload, and the header has to stay true
  // while the reader is in Diffs or Recap.
  const { state, reload } = usePrOverview(repoId, prNumber);
  const overview = state.status === "ready" ? state.overview : null;
  const tabSize = compact ? "sm" : "default";

  return (
    // Mounted unconditionally and above the tabs, so the workers spin up while
    // the surface is still hidden rather than on the click that reveals Diffs.
    // The pool itself is a refcounted singleton, so several review surfaces
    // share one set of workers and the last to unmount tears them down.
    <WorkerPoolContextProvider
      poolOptions={DIFF_POOL_OPTIONS}
      highlighterOptions={DIFF_HIGHLIGHTER_OPTIONS}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isReviewTab(value)) onTabChange(value);
        }}
        className="flex h-full min-h-0 flex-col"
      >
        {/* Until the overview lands, the surface's own block stands in for the
            header — same padding, so the title does not shift when it arrives. */}
        {overview === null ? (
          header === undefined && breadcrumb === undefined ? null : (
            <div className="shrink-0 space-y-2 px-4 pt-3">
              {breadcrumb}
              {header}
            </div>
          )
        ) : (
          <ReviewHeader
            repoId={repoId}
            overview={overview}
            refreshing={
              refresh?.running === true ||
              (state.status === "ready" && state.refreshing)
            }
            onRefresh={refresh?.run ?? reload}
            onTabChange={onTabChange}
            onChanged={reload}
            title={header}
            breadcrumb={breadcrumb}
          />
        )}
        {/* Zeroed left padding so the first tab's label lands on the same 16px
            edge as the header and the panel below it — TabsList adds 4px and the
            trigger 12px (10px when small), which is the whole inset. A left edge
            that steps in and out between three stacked rows is most of what reads
            as clutter on a surface this dense. */}
        <TabsBar
          size={tabSize}
          className={cn("pr-4", compact ? "pl-0.5" : "pl-0")}
          actions={overview === null ? null : <PrTabRail overview={overview} />}
        >
          {/* Pill tabs, not the underline the review surface used to carry: the
              filled marker is the same device the sandbox and settings tabs use,
              and it slides between tabs instead of redrawing a rule. */}
          <TabsList size={tabSize} className="h-auto gap-0.5 shadow-none">
            {REVIEW_TAB_ORDER.map((tab) => {
              const meta = REVIEW_TAB_META[tab];
              const Icon = meta.icon;
              const count = reviewTabCount(tab, overview);
              return (
                <TabsTrigger key={tab} value={tab} className="gap-1.5">
                  <Icon
                    size={compact ? 13 : 14}
                    className="shrink-0 opacity-70"
                    aria-hidden
                  />
                  {meta.label}
                  {count === null ? null : (
                    <CountPop
                      label={count.text}
                      className={cn(
                        "text-xs font-normal tabular-nums",
                        count.muted
                          ? "text-muted-foreground"
                          : "text-destructive",
                      )}
                    />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </TabsBar>

        {/* forceMount + hidden: switching tabs keeps each panel's state (drafted
            comments, scroll position, expanded files) instead of refetching. */}
        <ReviewTabContent tab="overview" activeTab={activeTab}>
          {prNumber === undefined ? (
            <NoPullRequest detail="Once a pull request is opened for this work, its activity will appear here." />
          ) : (
            <ReviewOverviewPanel
              repoId={repoId}
              prNumber={prNumber}
              state={state}
              reload={reload}
            />
          )}
        </ReviewTabContent>

        <ReviewTabContent tab="commits" activeTab={activeTab}>
          {overview === null ? (
            <NoPullRequest detail="Once a pull request is opened for this work, its commits will appear here." />
          ) : (
            <PrCommitsPanel repoId={repoId} overview={overview} />
          )}
        </ReviewTabContent>

        <ReviewTabContent tab="checks" activeTab={activeTab}>
          {overview === null ? (
            <NoPullRequest detail="Once a pull request is opened for this work, its checks will appear here." />
          ) : (
            <PrChecksPanel
              overview={overview}
              refreshing={state.status === "ready" && state.refreshing}
              onRefresh={reload}
            />
          )}
        </ReviewTabContent>

        <ReviewTabContent tab="diffs" activeTab={activeTab}>
          <DiffsPanel prUrl={prUrl} repoId={repoId} />
        </ReviewTabContent>

        <ReviewTabContent tab="recap" activeTab={activeTab}>
          <PrRecapPanel prUrl={prUrl} repoId={repoId} recapDoc={recapDoc} />
        </ReviewTabContent>
      </Tabs>
    </WorkerPoolContextProvider>
  );
}

function ReviewTabContent({
  tab,
  activeTab,
  children,
}: {
  tab: ReviewTab;
  activeTab: ReviewTab;
  children: ReactNode;
}) {
  return (
    <TabsContent
      value={tab}
      forceMount
      className={cn(
        "mt-0 min-h-0 flex-1 focus-visible:ring-0",
        activeTab !== tab && "hidden",
      )}
    >
      {/* Opacity only — remounting here would drop drafted comments and scroll. */}
      <m.div
        initial={false}
        animate={{ opacity: activeTab === tab ? 1 : 0 }}
        transition={motionFast}
        className="h-full min-h-0"
      >
        {children}
      </m.div>
    </TabsContent>
  );
}

function NoPullRequest({ detail }: { detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium">No pull request yet</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
