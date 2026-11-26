"use client";

import { taskCanResolveConflicts } from "@eva/shared";
import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ConfirmSkipHint,
  Spinner,
  skipConfirmTitle,
} from "@vvedantb/ui";
import { IconHammer, IconDots } from "@tabler/icons-react";
import type { TaskStatus } from "../TaskStatusBadge";

export interface MoreMenuVisibility {
  showResolveConflicts: boolean;
  showMoreMenu: boolean;
}

// Simple view hides the git plumbing: conflict resolution. The footer menu then has nothing
// left and drops out entirely; the header menu stays for Copy link.
export function getMoreMenuVisibility({
  simpleView,
  hasActiveRun,
  status,
  isHeader,
  hasPrItems,
}: {
  simpleView: boolean;
  hasActiveRun: boolean;
  status: TaskStatus | undefined;
  isHeader: boolean;
  hasPrItems: boolean;
}): MoreMenuVisibility {
  const showResolveConflicts =
    !simpleView && taskCanResolveConflicts(status, hasActiveRun);
  const showMoreMenu = isHeader || showResolveConflicts || hasPrItems;
  return { showResolveConflicts, showMoreMenu };
}

export interface TaskFooterMoreMenuProps {
  visibility: MoreMenuVisibility;
  prLinks: { hasItems: boolean; items: ReactNode };
  buttonSize: "default" | "sm";
  iconSize: number;
  isStarting: boolean;
  onResolveConfirm: () => void;
}

export function TaskFooterMoreMenu({
  visibility,
  prLinks,
  buttonSize,
  iconSize,
  isStarting,
  onResolveConfirm,
}: TaskFooterMoreMenuProps) {
  const { showResolveConflicts } = visibility;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size={buttonSize === "sm" ? "icon-sm" : "icon"}
          aria-label="More"
        >
          <IconDots size={iconSize} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <TaskSandboxMenuItems
          visibility={visibility}
          isStarting={isStarting}
          onResolveConfirm={onResolveConfirm}
        />
        {showResolveConflicts && prLinks.hasItems ? (
          <DropdownMenuSeparator />
        ) : null}
        {prLinks.items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type TaskSandboxMenuItemsProps = Pick<
  TaskFooterMoreMenuProps,
  "visibility" | "isStarting" | "onResolveConfirm"
>;

/** Resolve Conflicts; the task header reuses it. */
export function TaskSandboxMenuItems({
  visibility,
  isStarting,
  onResolveConfirm,
}: TaskSandboxMenuItemsProps) {
  return visibility.showResolveConflicts ? (
    <DropdownMenuItem
      onClick={onResolveConfirm}
      disabled={isStarting}
      title={skipConfirmTitle("Resolve Conflicts")}
    >
      <BusyMenuIcon busy={isStarting}>
        <IconHammer size={14} />
      </BusyMenuIcon>
      Resolve Conflicts
      <ConfirmSkipHint />
    </DropdownMenuItem>
  ) : null;
}

/** Spinner while the item's action runs, else its own icon. */
function BusyMenuIcon({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return busy ? (
    <Spinner variant="circle" size="sm" className="size-3.5" />
  ) : (
    children
  );
}
