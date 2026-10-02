"use client";

import type { ReactNode } from "react";
import {
  Button,
  Progress,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  RefreshSpinIcon,
} from "@eva/ui";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconSpacingHorizontal,
  IconTextWrap,
} from "@tabler/icons-react";
import { isDiffView, type DiffView } from "@/lib/search-params";
import { DiffCountBar } from "./DiffFileBadges";

interface DiffsToolbarProps {
  fileCount: number;
  additions: number;
  deletions: number;
  viewedCount: number;
  filter: string;
  onFilterChange: (value: string) => void;
  diffView: DiffView;
  onDiffViewChange: (view: DiffView) => void;
  wrapLines: boolean;
  onWrapLinesChange: (wrap: boolean) => void;
  ignoreWhitespace: boolean;
  onIgnoreWhitespaceChange: (ignore: boolean) => void;
  allExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  isLoading: boolean;
  onRefresh: () => void;
  /** Review-submission control, rendered last; absent when the surface cannot post reviews. */
  reviewAction?: ReactNode;
}

/**
 * Header bar for the Diffs tab, mirroring GitHub's "Files changed" chrome:
 * change totals, review progress, a file filter, layout and wrapping controls,
 * expand/collapse all, and Refresh. It lives inside the panel (rather than on
 * the host tab row) so the standalone Reviews page and the session Review tab
 * get the same controls.
 */
export function DiffsToolbar({
  fileCount,
  additions,
  deletions,
  viewedCount,
  filter,
  onFilterChange,
  diffView,
  onDiffViewChange,
  wrapLines,
  onWrapLinesChange,
  ignoreWhitespace,
  onIgnoreWhitespaceChange,
  allExpanded,
  onExpandAll,
  onCollapseAll,
  isLoading,
  onRefresh,
  reviewAction,
}: DiffsToolbarProps) {
  const viewedShare =
    fileCount === 0 ? 0 : Math.round((viewedCount / fileCount) * 100);

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background px-3 py-2">
      <span className="text-sm font-medium">
        {fileCount} {fileCount === 1 ? "changed file" : "changed files"}
      </span>
      <DiffCountBar additions={additions} deletions={deletions} />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SearchInput
          value={filter}
          onChange={onFilterChange}
          onClear={() => onFilterChange("")}
          placeholder="Filter files…"
          className="w-full max-sm:min-w-0 sm:w-44 sm:max-w-none"
          inputClassName="h-8 text-xs"
        />

        <Tabs
          value={diffView}
          onValueChange={(value) => {
            if (isDiffView(value)) onDiffViewChange(value);
          }}
        >
          <TabsList className="tabs-segmented h-8">
            <TabsTrigger value="unified" className="px-2.5 py-1 text-xs">
              Unified
            </TabsTrigger>
            {/* Two code columns do not fit a phone; `DiffsPanel` forces
                unified at the same breakpoint. */}
            <TabsTrigger
              value="split"
              className="px-2.5 py-1 text-xs max-md:hidden"
            >
              Split
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={wrapLines ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={wrapLines}
              // Radix wires TooltipContent as `aria-describedby` — a
              // description, not a name — so icon-only controls still need one.
              aria-label={wrapLines ? "Stop wrapping lines" : "Wrap long lines"}
              onClick={() => onWrapLinesChange(!wrapLines)}
            >
              <IconTextWrap className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {wrapLines ? "Stop wrapping lines" : "Wrap long lines"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ignoreWhitespace ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={ignoreWhitespace}
              aria-label={
                ignoreWhitespace
                  ? "Show whitespace changes"
                  : "Hide whitespace changes"
              }
              data-testid="ignore-whitespace-toggle"
              onClick={() => onIgnoreWhitespaceChange(!ignoreWhitespace)}
            >
              <IconSpacingHorizontal className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {ignoreWhitespace
              ? "Show whitespace changes"
              : "Hide whitespace changes"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                allExpanded ? "Collapse all files" : "Expand all files"
              }
              onClick={allExpanded ? onCollapseAll : onExpandAll}
            >
              {allExpanded ? (
                <IconChevronsUp className="size-4" />
              ) : (
                <IconChevronsDown className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {allExpanded ? "Collapse all files" : "Expand all files"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh diffs"
            >
              <RefreshSpinIcon busy={isLoading} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>

        {fileCount > 0 ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {viewedCount}/{fileCount} viewed
            </span>
            {viewedCount > 0 ? (
              // Was a hand-rolled bar transitioning `width`, which relayouts on
              // every frame. `Progress` is the same shape and moves the fill on
              // `transform`, so it stays on the compositor.
              <Progress className="h-1.5 w-16" value={viewedShare} />
            ) : null}
          </span>
        ) : null}

        {reviewAction}
      </div>
    </div>
  );
}
