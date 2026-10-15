"use client";

import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@eva/ui";
import {
  IconChevronsDown,
  IconChevronsUp,
  IconDots,
  IconLayoutColumns,
  IconLayoutRows,
  IconLayoutSidebarRight,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import type { DiffView } from "@/lib/search-params";

interface DiffsToolbarProps {
  /** The commit Code is scoped to, shown as a clearable chip; null for all. */
  scopedCommit: { sha: string; headline: string } | null;
  onClearScope: () => void;
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
 * Code's controls, as few as Cursor shows: a stacked/split toggle and a file
 * tree toggle beside the tabs. Everything a reader reaches for rarely —
 * wrapping, whitespace, fold all, refresh — sits behind one overflow menu.
 * A commit scope set from Timeline shows as a chip that clears back to the
 * whole change.
 */
export function DiffsToolbar({
  scopedCommit,
  onClearScope,
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
  return (
    <>
      {scopedCommit === null ? null : (
        <span className="mr-1 flex max-w-64 min-w-0 items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-2.5 text-xs">
          <span className="truncate" title={scopedCommit.headline}>
            <span className="font-mono text-muted-foreground">
              {scopedCommit.sha.slice(0, 7)}
            </span>{" "}
            {scopedCommit.headline}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 rounded-full"
            aria-label="Show all commits"
            onClick={onClearScope}
          >
            <IconX />
          </Button>
        </span>
      )}
      <IconToggle
        pressed={false}
        onPress={() => onDiffViewChange(diffView === "unified" ? "split" : "unified")}
        label={diffView === "unified" ? "Switch to split view" : "Switch to stacked view"}
        className="max-md:hidden"
      >
        {diffView === "unified" ? <IconLayoutRows /> : <IconLayoutColumns />}
      </IconToggle>
      <IconToggle
        pressed={treeOpen}
        onPress={() => onTreeOpenChange(!treeOpen)}
        label={treeOpen ? "Hide file tree" : "Show file tree"}
      >
        <IconLayoutSidebarRight />
      </IconToggle>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="More diff options">
            <IconDots />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            checked={wrapLines}
            onCheckedChange={(checked) => onWrapLinesChange(checked === true)}
          >
            Wrap lines
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={ignoreWhitespace}
            onCheckedChange={(checked) =>
              onIgnoreWhitespaceChange(checked === true)
            }
            data-testid="ignore-whitespace-toggle"
          >
            Hide whitespace changes
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={allExpanded ? onCollapseAll : onExpandAll}>
            {allExpanded ? (
              <IconChevronsUp className="size-4" />
            ) : (
              <IconChevronsDown className="size-4" />
            )}
            {allExpanded ? "Collapse all files" : "Expand all files"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRefresh} disabled={isLoading}>
            <IconRefresh className="size-4" />
            Refresh diff
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function IconToggle({
  pressed,
  onPress,
  label,
  className,
  children,
}: {
  pressed: boolean;
  onPress: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={pressed}
          // Radix wires TooltipContent as a description, not a name.
          aria-label={label}
          className={cn(pressed && "bg-muted text-foreground", className)}
          onClick={onPress}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
