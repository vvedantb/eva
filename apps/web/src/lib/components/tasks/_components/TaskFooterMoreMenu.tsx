"use client";

import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  CircleSpinner,
} from "@eva/ui";
import {
  IconHammer,
  IconPlayerPlay,
  IconDots,
  IconRefresh,
  IconServerBolt,
} from "@tabler/icons-react";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
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
          visibility={visibility}
          isRetryingStartupCommands={isRetryingStartupCommands}
          isRunningDevServer={isRunningDevServer}
          isRunningBackgroundCommands={isRunningBackgroundCommands}
          onRunStartupCommands={onRunStartupCommands}
          onRunDevServer={onRunDevServer}
          onRunBackgroundCommands={onRunBackgroundCommands}
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

function SandboxCommandMenuItems({
  visibility,
  isRetryingStartupCommands,
  isRunningDevServer,
  isRunningBackgroundCommands,
  onRunStartupCommands,
  onRunDevServer,
  onRunBackgroundCommands,
}: {
  visibility: MoreMenuVisibility;
  isRetryingStartupCommands: boolean;
  isRunningDevServer: boolean;
  isRunningBackgroundCommands: boolean;
  onRunStartupCommands: () => void;
  onRunDevServer: () => void;
  onRunBackgroundCommands: () => void;
}) {
  return (
    <>
      {visibility.showRunStartupCommands && (
        <DropdownMenuItem
          onClick={onRunStartupCommands}
          disabled={isRetryingStartupCommands}
          title={skipConfirmTitle("Run Startup Commands")}
        >
          <BusyMenuIcon busy={isRetryingStartupCommands}>
            <IconRefresh size={14} />
          </BusyMenuIcon>
          Run Startup Commands
          <ConfirmSkipHint />
        </DropdownMenuItem>
      )}
      {visibility.showRunDevServer ? (
        <DropdownMenuItem
          onClick={onRunDevServer}
          disabled={isRunningDevServer}
          title={skipConfirmTitle("Run Dev Server")}
        >
          <BusyMenuIcon busy={isRunningDevServer}>
            <IconPlayerPlay size={14} />
          </BusyMenuIcon>
          Run Dev Server
          <ConfirmSkipHint />
        </DropdownMenuItem>
      ) : null}
      {visibility.showRunBackgroundCommands ? (
        <DropdownMenuItem
          onClick={onRunBackgroundCommands}
          disabled={isRunningBackgroundCommands}
        >
          <BusyMenuIcon busy={isRunningBackgroundCommands}>
            <IconServerBolt size={14} />
          </BusyMenuIcon>
          Run Background Commands
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

/** Spinner while the item's action runs, else its own icon. */
function BusyMenuIcon({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return busy ? <CircleSpinner size="sm" className="size-3.5" /> : children;
}
