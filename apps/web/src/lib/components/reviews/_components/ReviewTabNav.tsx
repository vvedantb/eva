"use client";

import { Tabs, TabsList, TabsTrigger } from "@eva/ui";
import { isReviewTab, type ReviewTab } from "@/lib/search-params";
import { REVIEW_TAB_LABEL, REVIEW_TAB_ORDER } from "./reviewTabMeta";

/**
 * The tab row, as Cursor keeps it: the tabs on the left and, on the right, an
 * empty slot the open tab may fill with its own few controls (Code puts its
 * layout and tree toggles there). Nothing else — no counts, no CI line; those
 * live in the tabs themselves.
 */
export function ReviewTabNav({
  activeTab,
  onTabChange,
  controlsRef,
}: {
  activeTab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  /** Receives the right-hand slot element, for a tab to portal into. */
  controlsRef: (element: HTMLElement | null) => void;
}) {
  return (
    <nav
      aria-label="Pull request tabs"
      className="flex min-h-12 min-w-0 items-center gap-2 px-4 py-2"
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isReviewTab(value)) onTabChange(value);
        }}
      >
        <TabsList
          size="sm"
          // Body size, like the branch line above: the small preset (12px)
          // made the tabs the smallest text in the header.
          className="h-8 shrink-0 gap-0.5 p-0 shadow-none [&_.t-tab]:text-sm"
        >
          {REVIEW_TAB_ORDER.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {REVIEW_TAB_LABEL[tab]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div ref={controlsRef} className="ml-auto flex shrink-0 items-center gap-1" />
    </nav>
  );
}
