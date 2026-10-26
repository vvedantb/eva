"use client";

import type { ReactNode } from "react";
import { cn } from "@eva/ui";
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
} from "@vvedantb/ui";
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
import { PrDiffStat } from "@/lib/components/reviews/_components/prReviewParts";
import { DIFF_FILE_KINDS, type DiffFileKind, type DiffSize } from "./diffFiles";

const KIND_LABEL: Record<DiffFileKind, string> = {
  code: "Code",
  tests: "Tests",
  mocks: "Mocks",
  generated: "Generated",
};

interface DiffsToolbarProps {
  /** Line totals of the files on screen; null while the diff is not loaded. */
  size: DiffSize | null;
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
  size,
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
      {size === null || size.total.files === 0 ? null : (
        <DiffSizeSplit size={size} />
      )}
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
        onPress={() =>
          onDiffViewChange(diffView === "unified" ? "split" : "unified")
        }
        label={
          diffView === "unified"
            ? "Switch to split view"
            : "Switch to stacked view"
        }
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
          <DropdownMenuItem
            onSelect={allExpanded ? onCollapseAll : onExpandAll}
          >
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

/**
 * The diff's `+n −m`, and beside it how much of that is code — so a "+2,000"
 * that is mostly lockfile and tests reads as the 300 lines it really is. The
 * tooltip breaks it down by kind.
 */
function DiffSizeSplit({
  size,
}: {
  size: DiffSize;
}) {
  const { total, byKind } = size;
  const code = byKind.code;
  const allCode = code.files === total.files;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="mr-1 flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground max-sm:hidden"
        >
          <PrDiffStat
            additions={total.additions}
            deletions={total.deletions}
            hideZero
          />
          {allCode ? null : (
            <span className="tabular-nums">
              · {(code.additions + code.deletions).toLocaleString()} code
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <table className="text-xs">
          <tbody>
            {DIFF_FILE_KINDS.filter((kind) => byKind[kind].files > 0).map(
              (kind) => (
                <tr key={kind}>
                  <td className="pr-3">{KIND_LABEL[kind]}</td>
                  <td className="pr-3 text-right tabular-nums opacity-70">
                    {byKind[kind].files}{" "}
                    {byKind[kind].files === 1 ? "file" : "files"}
                  </td>
                  <td>
                    <PrDiffStat
                      additions={byKind[kind].additions}
                      deletions={byKind[kind].deletions}
                    />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TooltipContent>
    </Tooltip>
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
