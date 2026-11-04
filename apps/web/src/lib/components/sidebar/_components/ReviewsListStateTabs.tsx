"use client";

import { Tabs, TabsList, TabsTrigger } from "@vvedantb/ui";
import type { PullRequestListState } from "@/lib/search-params";

const PR_LIST_STATES = ["open", "closed", "all"] as const;

function isPullRequestListState(value: string): value is PullRequestListState {
  for (const state of PR_LIST_STATES) {
    if (state === value) return true;
  }
  return false;
}

interface ReviewsListStateTabsProps {
  state: PullRequestListState;
  onChange: (state: PullRequestListState) => void;
}

/** Segmented Open / Closed / All switch for the Reviews sidebar. */
export function ReviewsListStateTabs({
  state,
  onChange,
}: ReviewsListStateTabsProps) {
  return (
    <Tabs
      value={state}
      onValueChange={(value) => {
        if (isPullRequestListState(value)) onChange(value);
      }}
    >
      <TabsList className="tabs-segmented h-8 w-full">
        <TabsTrigger value="open" className="flex-1 px-2.5 py-1 text-xs">
          Open
        </TabsTrigger>
        <TabsTrigger value="closed" className="flex-1 px-2.5 py-1 text-xs">
          Closed
        </TabsTrigger>
        <TabsTrigger value="all" className="flex-1 px-2.5 py-1 text-xs">
          All
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
