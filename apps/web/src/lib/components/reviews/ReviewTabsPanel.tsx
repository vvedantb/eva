"use client";

import { useState, type ReactNode, type UIEvent } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { Button, Spinner, cn } from "@eva/ui";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { IconAlertTriangle, IconGitPullRequest } from "@tabler/icons-react";
import type { ReviewTab } from "@/lib/search-params";
import { DiffsPanel } from "@/lib/components/sandbox/DiffsPanel";
import {
  DIFF_HIGHLIGHTER_OPTIONS,
  DIFF_POOL_OPTIONS,
} from "@/lib/components/sandbox/diffWorkerPool";
import { ReviewSummaryTab } from "./ReviewSummaryTab";
import { ReviewTimelineTab } from "./ReviewTimelineTab";
import { usePrOverview, type PrOverviewState } from "./usePrOverview";
import type { PrOverview } from "./_components/prOverviewMeta";
import { PrComposer } from "./_components/PrComposer";
import { ReviewHeader } from "./_components/ReviewHeader";
import { ReviewTabNav, type TimelineOrder } from "./_components/ReviewTabNav";
import { REVIEW_TAB_ORDER } from "./_components/reviewTabMeta";

interface ReviewTabsPanelProps {
  repoId: Id<"githubRepos">;
  /** Absent until a pull request exists for the work being reviewed. */
  prUrl?: string;
  prNumber?: number;
  activeTab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  /**
   * Shown in place of the header until the overview lands — the standalone
   * page's cached title, so a revisited pull request names itself at once.
   */
  placeholder?: ReactNode;
  /**
   * Renews every payload the surface shows, not just the overview — the
   * standalone page also has a title block, read from its own query.
   */
  refresh?: { run: () => void; running: boolean };
}

/** Past this, the header folds away so the tabs and actions keep the pane. */
const CONDENSE_AT_PX = 48;

/**
 * The pull request review surface, reimplemented on t3code's layout and shared
 * by the standalone Reviews page and the sandbox Review tab:
 *
 * - a header that folds on scroll (`ReviewHeader`), ending in the tab row,
 * - three tabs — Summary, Timeline, Code — each its own scroll box, all kept
 *   mounted so drafts, scroll and expanded files survive a switch,
 * - one floating composer (`PrComposer`) for comments and the review.
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
  placeholder,
  refresh,
}: ReviewTabsPanelProps) {
  const recapDoc = useQuery(
    api.docs.getRecapByPrUrl,
    prUrl ? { repoId, prUrl } : "skip",
  );
  const { state, reload } = usePrOverview(repoId, prNumber);
  const overview = state.status === "ready" ? state.overview : null;
  const [timelineOrder, setTimelineOrder] = useLocalStorage<TimelineOrder>(
    "eva:pr-timeline-order",
    "newest",
  );
  // The commit Code is scoped to. Owned here because Timeline sets it too: a
  // commit row opens Code on that commit.
  const [codeCommit, setCodeCommit] = useState<string | null>(null);
  // Per tab, so returning to a tab scrolled past its fold keeps it folded.
  const [condensedByTab, setCondensedByTab] = useState<
    Partial<Record<ReviewTab, boolean>>
  >({});
  const condensed = condensedByTab[activeTab] === true;

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.target;
    // Only a tab's own vertical scroll box counts: a code line scrolling
    // sideways, or a list inside a portalled popover, reports scrollTop 0 too.
    if (!(target instanceof HTMLElement)) return;
    if (target.scrollHeight <= target.clientHeight) return;
    if (!target.isConnected || target.closest("[data-radix-popper-content-wrapper]")) return;
    const top = target.scrollTop;
    // The hard top reopens it; only scrolling well past the fold closes it.
    const next = condensed ? top >= 4 : top > CONDENSE_AT_PX;
    if (next !== condensed) {
      setCondensedByTab((current) => ({ ...current, [activeTab]: next }));
    }
  };

  const openCommit = (sha: string) => {
    setCodeCommit(sha);
    onTabChange("diffs");
  };

  const nav = (
    <ReviewTabNav
      activeTab={activeTab}
      onTabChange={onTabChange}
      overview={overview}
      timelineOrder={timelineOrder}
      onTimelineOrderChange={setTimelineOrder}
    />
  );

  return (
    // Mounted above the tabs, so the workers spin up while Code is still hidden
    // rather than on the click that reveals it. The pool is a refcounted
    // singleton shared by every review surface.
    <WorkerPoolContextProvider
      poolOptions={DIFF_POOL_OPTIONS}
      highlighterOptions={DIFF_HIGHLIGHTER_OPTIONS}
    >
      <div className="relative flex h-full min-h-0 w-full flex-col bg-background">
        {overview === null ? (
          <div className="shrink-0 border-b border-border">
            {placeholder === undefined ? null : (
              <div className="px-4 pt-3 pb-2">{placeholder}</div>
            )}
            {nav}
          </div>
        ) : (
          <ReviewHeader
            repoId={repoId}
            overview={overview}
            condensed={condensed}
            refreshing={
              refresh?.running === true ||
              (state.status === "ready" && state.refreshing)
            }
            onRefresh={refresh?.run ?? reload}
            onChanged={reload}
            nav={nav}
          />
        )}

        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          onScrollCapture={handleScroll}
        >
          {REVIEW_TAB_ORDER.map((tab) => (
            <div
              key={tab}
              className={cn("absolute inset-0", activeTab !== tab && "invisible")}
              inert={activeTab !== tab}
            >
              {tab === "diffs" ? (
                <DiffsPanel
                  prUrl={prUrl}
                  repoId={repoId}
                  commits={overview?.commits ?? []}
                  commit={codeCommit}
                  onCommitChange={setCodeCommit}
                />
              ) : (
                <OverviewGate state={state} reload={reload}>
                  {(ready) =>
                    tab === "summary" ? (
                      <ReviewSummaryTab
                        repoId={repoId}
                        prUrl={prUrl}
                        overview={ready}
                        recapDoc={recapDoc}
                        onChanged={reload}
                      />
                    ) : (
                      <ReviewTimelineTab
                        repoId={repoId}
                        overview={ready}
                        order={timelineOrder}
                        onOpenCommit={openCommit}
                      />
                    )
                  }
                </OverviewGate>
              )}
            </div>
          ))}
        </div>

        {/* Floats over the content; no tab reserves a footer for it. From `lg`
            it steps left of the Manager Ave launcher, which owns the
            viewport's bottom-right corner there. */}
        {overview === null ? null : (
          <div className="absolute right-4 bottom-4 z-20 lg:right-20">
            <PrComposer
              repoId={repoId}
              prNumber={overview.number}
              isOpen={overview.status === "open"}
              onPosted={reload}
            />
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
  );
}

/** The states before Summary and Timeline have an overview to render. */
function OverviewGate({
  state,
  reload,
  children,
}: {
  state: PrOverviewState;
  reload: () => void;
  children: (overview: PrOverview) => ReactNode;
}) {
  if (state.status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No pull request yet</p>
          <p className="text-sm text-muted-foreground">
            Once a pull request is opened for this work, it will appear here.
          </p>
        </div>
      </div>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Spinner size="sm" />
        Loading pull request…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconAlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{state.message}</p>
        <Button size="sm" variant="secondary" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }
  return children(state.overview);
}
