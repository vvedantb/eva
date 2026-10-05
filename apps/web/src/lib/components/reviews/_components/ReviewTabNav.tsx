"use client";

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@eva/ui";
import {
  IconArrowsSort,
  IconCircleDot,
  IconGitCommit,
  IconMessage,
} from "@tabler/icons-react";
import { isReviewTab, type ReviewTab } from "@/lib/search-params";
import { checksHeadline, checksOverallTone, countChecks } from "./prMergeState";
import { PrCheckRow } from "./PrCheckRow";
import { ToneIcon, type PrOverview } from "./prOverviewMeta";
import { PrMetaLine } from "./prReviewParts";
import { REVIEW_TAB_LABEL, REVIEW_TAB_ORDER } from "./reviewTabMeta";

export type TimelineOrder = "newest" | "oldest";

/**
 * The tab row: a segmented Summary / Timeline / Code switch on the left and, on
 * the right, the one line of facts that belongs to the open tab — CI for
 * Summary, the size of the conversation and its order for Timeline. Code owns a
 * toolbar of its own, so it leaves this side empty.
 */
export function ReviewTabNav({
  activeTab,
  onTabChange,
  overview,
  timelineOrder,
  onTimelineOrderChange,
}: {
  activeTab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  overview: PrOverview | null;
  timelineOrder: TimelineOrder;
  onTimelineOrderChange: (order: TimelineOrder) => void;
}) {
  return (
    <nav
      aria-label="Pull request tabs"
      className="flex min-h-11 min-w-0 flex-wrap items-center gap-2 border-t border-border px-4 py-1.5 first:border-t-0"
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isReviewTab(value)) onTabChange(value);
        }}
      >
        <TabsList size="sm" className="tabs-segmented h-8 shrink-0">
          {REVIEW_TAB_ORDER.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {REVIEW_TAB_LABEL[tab]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {overview === null ? null : activeTab === "summary" ? (
        <ChecksSummary overview={overview} />
      ) : activeTab === "timeline" ? (
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <PrMetaLine className="whitespace-nowrap">
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              aria-label={`${overview.comments.length} comments`}
            >
              <IconMessage size={12} aria-hidden />
              {overview.comments.length}
              {overview.commentsTruncated ? "+" : ""}
            </span>
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              aria-label={`${overview.commitCount} commits`}
            >
              <IconGitCommit size={12} aria-hidden />
              {overview.commitCount}
            </span>
          </PrMetaLine>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              onTimelineOrderChange(
                timelineOrder === "newest" ? "oldest" : "newest",
              )
            }
            aria-label={
              timelineOrder === "newest"
                ? "Show oldest activity first"
                : "Show newest activity first"
            }
          >
            <IconArrowsSort aria-hidden />
            {timelineOrder === "newest" ? "Newest first" : "Oldest first"}
          </Button>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * "Is CI done, and did it pass", in one line at the end of the tab row. The
 * glyph opens the full run list, so a red check is one click from its log.
 */
function ChecksSummary({ overview }: { overview: PrOverview }) {
  const counts = countChecks(overview.checks);
  if (counts.total === 0) {
    return (
      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconCircleDot size={13} aria-hidden />
        No checks
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-auto flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={`Checks: ${checksHeadline(counts)}`}
        >
          <ToneIcon tone={checksOverallTone(counts)} size={13} />
          <span className="truncate">{checksHeadline(counts)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <ul className="max-h-80 space-y-0.5 overflow-auto">
          {overview.checks.map((check) => (
            <li key={`${check.kind}-${check.name}`}>
              <PrCheckRow check={check} />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
