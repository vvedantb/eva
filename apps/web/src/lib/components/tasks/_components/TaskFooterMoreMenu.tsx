"use client";

import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@eva/ui";
import { IconHammer, IconDots } from "@tabler/icons-react";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
import {
  BusyMenuIcon,
  SandboxCommandMenuItems,
} from "@/lib/components/sandbox/SandboxCommandMenuItems";
import type { TaskStatus } from "../TaskStatusBadge";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

export interface MoreMenuVisibility {
  showResolveConflicts: boolean;
  showRunStartupCommands: boolean;
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
  const showRunStartupCommands = !simpleView && canStartSandbox;
  const showRunDevServer = !simpleView && isSandboxActive && canStartSandbox;
  const showRunBackgroundCommands =
    !simpleView && isSandboxActive && canStartSandbox;
  const hasSandboxCommandItems =
    showRunStartupCommands || showRunDevServer || showRunBackgroundCommands;
  const showMoreMenu =
    isHeader || showResolveConflicts || hasSandboxCommandItems || hasPrItems;
  return {
    showResolveConflicts,
    showRunStartupCommands,
    showRunDevServer,
    showRunBackgroundCommands,
    hasSandboxCommandItems,
    showMoreMenu,
  };
}

interface TaskFooterMoreMenuProps {
  visibility: MoreMenuVisibility;
  prLinks: { hasItems: boolean; items: ReactNode };
  isHeader: boolean;
  buttonSize: "default" | "sm";
  iconSize: number;
  isStarting: boolean;
  isRetryingStartupCommands: boolean;
  isRunningDevServer: boolean;
  isRunningBackgroundCommands: boolean;
  onResolveConfirm: () => void;
  onRunStartupCommands: () => void;
  onRunDevServer: () => void;
  onRunBackgroundCommands: () => void;
}

export function TaskFooterMoreMenu({
  visibility,
  prLinks,
  isHeader,
  buttonSize,
  iconSize,
  isStarting,
  isRetryingStartupCommands,
  isRunningDevServer,
  isRunningBackgroundCommands,
  onResolveConfirm,
  onRunStartupCommands,
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
          startupCommands={{
            show: visibility.showRunStartupCommands,
            busy: isRetryingStartupCommands,
            onRun: onRunStartupCommands,
          }}
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
        {(showResolveConflicts || hasSandboxCommandItems) &&
        prLinks.hasItems ? (
          <DropdownMenuSeparator />
        ) : null}
        {prLinks.items}
        {isHeader ? (
          <>
            {(showResolveConflicts ||
              hasSandboxCommandItems ||
              prLinks.hasItems) && <DropdownMenuSeparator />}
            <CopyLinkMenuItem iconSize={14} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
