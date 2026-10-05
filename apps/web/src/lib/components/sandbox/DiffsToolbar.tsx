"use client";

import type { ReactNode } from "react";
import {
  Button,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  RefreshSpinIcon,
  cn,
} from "@eva/ui";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconLayoutColumns,
  IconLayoutRows,
  IconListTree,
  IconPilcrow,
  IconTextWrap,
} from "@tabler/icons-react";
import { isDiffView, type DiffView } from "@/lib/search-params";

interface DiffsToolbarProps {
  /** The commit-scope dropdown; absent where there is nothing to scope by. */
  scope?: ReactNode;
  fileCount: number;
  viewedCount: number;
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
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
}

/**
 * The Code tab's toolbar, laid out as t3code's: one 40px strip with the scope
 * and the reading progress on the left, and the reading controls as icon
 * toggles on the right — whitespace, fold all, stacked/split, wrap, refresh, and
 * the file tree. It lives inside the panel so every review surface gets the
 * same controls.
 */
export function DiffsToolbar({
  scope,
  fileCount,
  viewedCount,
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
  treeOpen,
  onTreeOpenChange,
}: DiffsToolbarProps) {
  const viewedShare =
    fileCount === 0 ? 0 : Math.round((viewedCount / fileCount) * 100);

  return (
    <div className="flex h-10 min-h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4 text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {scope}
        <span className="shrink-0 tabular-nums">
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </span>
        {fileCount > 0 ? (
          <span className="flex min-w-0 items-center gap-2 tabular-nums max-sm:hidden">
            <span className="shrink-0">
              {viewedCount} / {fileCount} viewed
            </span>
            {/* `Progress` moves its fill on `transform`, so it stays on the
                compositor rather than relaying out on every tick. */}
            <Progress className="h-1 w-12 shrink-0" value={viewedShare} />
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconToggle
          pressed={ignoreWhitespace}
          onPressedChange={onIgnoreWhitespaceChange}
          label={
            ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"
          }
          testId="ignore-whitespace-toggle"
        >
          <IconPilcrow />
        </IconToggle>
        <IconToggle
          pressed={false}
          onPressedChange={() => (allExpanded ? onCollapseAll() : onExpandAll())}
          label={allExpanded ? "Collapse all files" : "Expand all files"}
        >
          {allExpanded ? <IconChevronsUp /> : <IconChevronsDown />}
        </IconToggle>
        <Tabs
          value={diffView}
          onValueChange={(value) => {
            if (isDiffView(value)) onDiffViewChange(value);
          }}
          className="mx-1"
        >
          <TabsList size="sm" className="tabs-segmented h-7 p-0.5">
            <TabsTrigger
              value="unified"
              aria-label="Stacked diff view"
              className="h-6 px-1.5"
            >
              <IconLayoutRows className="size-3.5" />
            </TabsTrigger>
            {/* Two code columns do not fit a phone; `DiffsPanel` forces
                unified at the same breakpoint. */}
            <TabsTrigger
              value="split"
              aria-label="Split diff view"
              className="h-6 px-1.5 max-md:hidden"
            >
              <IconLayoutColumns className="size-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <IconToggle
          pressed={wrapLines}
          onPressedChange={onWrapLinesChange}
          label={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}
        >
          <IconTextWrap />
        </IconToggle>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh diff"
            >
              <RefreshSpinIcon busy={isLoading} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh diff</TooltipContent>
        </Tooltip>
        {fileCount > 0 ? (
          <IconToggle
            pressed={treeOpen}
            onPressedChange={onTreeOpenChange}
            label={treeOpen ? "Hide file tree" : "Show file tree"}
          >
            <IconListTree />
          </IconToggle>
        ) : null}
      </div>
    </div>
  );
}

function IconToggle({
  pressed,
  onPressedChange,
  label,
  testId,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-pressed={pressed}
          // Radix wires TooltipContent as `aria-describedby` — a description,
          // not a name — so icon-only controls still need one.
          aria-label={label}
          data-testid={testId}
          className={cn(pressed && "bg-muted text-foreground")}
          onClick={() => onPressedChange(!pressed)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
