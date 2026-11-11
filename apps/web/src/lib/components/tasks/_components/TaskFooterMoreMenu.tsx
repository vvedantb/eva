"use client";

import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ConfirmSkipHint,
  skipConfirmTitle,
} from "@vvedantb/ui";
import { IconHammer, IconDots } from "@tabler/icons-react";
import {
  BusyMenuIcon,
  SandboxCommandMenuItems,
} from "@/lib/components/sandbox/SandboxCommandMenuItems";
import type { TaskStatus } from "../TaskStatusBadge";

export interface MoreMenuVisibility {
  showResolveConflicts: boolean;
  showRunDevServer: boolean;
  showRunBackgroundCommands: boolean;
  hasSandboxCommandItems: boolean;
  showMoreMenu: boolean;
}

// Simple view hides the git/sandbox plumbing: conflict resolution and the
// startup/dev/background command runners. The footer menu then has nothing
// left and drops out entirely; the header menu stays for Copy link.
export function getMoreMenuVisibility({
  simpleView,
  hasActiveRun,
  status,
  canStartSandbox,
  isSandboxActive,
  isHeader,
  hasPrItems,
}: {
  simpleView: boolean;
  hasActiveRun: boolean;
  status: TaskStatus | undefined;
  canStartSandbox: boolean;
  isSandboxActive: boolean;
  isHeader: boolean;
  hasPrItems: boolean;
}): MoreMenuVisibility {
  const showResolveConflicts =
    !simpleView &&
    !hasActiveRun &&
    (status === "code_review" || status === "business_review");
  const showRunDevServer = !simpleView && isSandboxActive && canStartSandbox;
  const showRunBackgroundCommands =
    !simpleView && isSandboxActive && canStartSandbox;
  const hasSandboxCommandItems =
    showRunDevServer || showRunBackgroundCommands;
  const showMoreMenu =
    isHeader || showResolveConflicts || hasSandboxCommandItems || hasPrItems;
  return {
    showResolveConflicts,
    showRunDevServer,
    showRunBackgroundCommands,
    hasSandboxCommandItems,
    showMoreMenu,
  };
}

export interface TaskFooterMoreMenuProps {
  visibility: MoreMenuVisibility;
  prLinks: { hasItems: boolean; items: ReactNode };
  buttonSize: "default" | "sm";
  iconSize: number;
  isStarting: boolean;
  isRunningDevServer: boolean;
  isRunningBackgroundCommands: boolean;
  onResolveConfirm: () => void;
  onRunDevServer: () => void;
  onRunBackgroundCommands: () => void;
}

export function TaskFooterMoreMenu({
  visibility,
  prLinks,
  buttonSize,
  iconSize,
  isStarting,
  isRunningDevServer,
  isRunningBackgroundCommands,
  onResolveConfirm,
  onRunDevServer,
  onRunBackgroundCommands,
}: TaskFooterMoreMenuProps) {
  const { showResolveConflicts, hasSandboxCommandItems } = visibility;
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
          isRunningDevServer={isRunningDevServer}
          isRunningBackgroundCommands={isRunningBackgroundCommands}
          onResolveConfirm={onResolveConfirm}
          onRunDevServer={onRunDevServer}
          onRunBackgroundCommands={onRunBackgroundCommands}
        />
        {(showResolveConflicts || hasSandboxCommandItems) &&
        prLinks.hasItems ? (
          <DropdownMenuSeparator />
        ) : null}
        {prLinks.items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type TaskSandboxMenuItemsProps = Pick<
  TaskFooterMoreMenuProps,
  | "visibility"
  | "isStarting"
  | "isRunningDevServer"
  | "isRunningBackgroundCommands"
  | "onResolveConfirm"
  | "onRunDevServer"
  | "onRunBackgroundCommands"
>;

/** Resolve Conflicts and the sandbox command runners; the task header reuses them. */
export function TaskSandboxMenuItems({
  visibility,
  isStarting,
  isRunningDevServer,
  isRunningBackgroundCommands,
  onResolveConfirm,
  onRunDevServer,
  onRunBackgroundCommands,
}: TaskSandboxMenuItemsProps) {
  const { showResolveConflicts, hasSandboxCommandItems } = visibility;
  return (
    <>
      {showResolveConflicts && (
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
      )}
      {showResolveConflicts && hasSandboxCommandItems ? (
        <DropdownMenuSeparator />
      ) : null}
      <SandboxCommandMenuItems
        devServer={{
          show: visibility.showRunDevServer,
          busy: isRunningDevServer,
          onRun: onRunDevServer,
        }}
        backgroundCommands={{
          show: visibility.showRunBackgroundCommands,
          busy: isRunningBackgroundCommands,
          onRun: onRunBackgroundCommands,
        }}
      />
    </>
  );
}
