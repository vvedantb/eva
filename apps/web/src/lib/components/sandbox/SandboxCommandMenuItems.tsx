import type { ReactNode } from "react";
import { DropdownMenuItem, CircleSpinner } from "@eva/ui";
import {
  IconPlayerPlay,
  IconRefresh,
  IconServerBolt,
} from "@tabler/icons-react";
import { ConfirmSkipHint, skipConfirmTitle } from "@/lib/confirm";

/** One sandbox command row: whether it shows, its in-flight state, its action. */
export interface SandboxCommandMenuItem {
  show: boolean;
  busy: boolean;
  onRun: () => void;
}

/**
 * The sandbox command rows of the task and project "More" menus. Startup and
 * dev server are confirmed actions (Alt skips the dialog); background commands
 * run directly. Omit `devServer` where the surface has no dev server runner.
 */
export function SandboxCommandMenuItems({
  startupCommands,
  devServer,
  backgroundCommands,
}: {
  startupCommands: SandboxCommandMenuItem;
  devServer?: SandboxCommandMenuItem;
  backgroundCommands: SandboxCommandMenuItem;
}) {
  return (
    <>
      {startupCommands.show ? (
        <DropdownMenuItem
          onClick={startupCommands.onRun}
          disabled={startupCommands.busy}
          title={skipConfirmTitle("Run Startup Commands")}
        >
          <BusyMenuIcon busy={startupCommands.busy}>
            <IconRefresh size={14} />
          </BusyMenuIcon>
          Run Startup Commands
          <ConfirmSkipHint />
        </DropdownMenuItem>
      ) : null}
      {devServer?.show ? (
        <DropdownMenuItem
          onClick={devServer.onRun}
          disabled={devServer.busy}
          title={skipConfirmTitle("Run Dev Server")}
        >
          <BusyMenuIcon busy={devServer.busy}>
            <IconPlayerPlay size={14} />
          </BusyMenuIcon>
          Run Dev Server
          <ConfirmSkipHint />
        </DropdownMenuItem>
      ) : null}
      {backgroundCommands.show ? (
        <DropdownMenuItem
          onClick={backgroundCommands.onRun}
          disabled={backgroundCommands.busy}
        >
          <BusyMenuIcon busy={backgroundCommands.busy}>
            <IconServerBolt size={14} />
          </BusyMenuIcon>
          Run Background Commands
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

/** Spinner while the item's action runs, else its own icon. */
export function BusyMenuIcon({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return busy ? <CircleSpinner size="sm" className="size-3.5" /> : children;
}
