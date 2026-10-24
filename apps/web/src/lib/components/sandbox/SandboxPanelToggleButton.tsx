"use client";

import {
  Button,
  CrossfadeIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import {
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from "@tabler/icons-react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { useShortcutBinding } from "@/lib/hotkeys/useShortcut";

/** Show/hide the sandbox content pane; the icon rail stays. */
export function SandboxPanelToggleButton({
  collapsed,
  onToggle,
  expandLabel = "Show sandbox panel",
  collapseLabel = "Hide sandbox panel",
}: {
  collapsed: boolean;
  onToggle: () => void;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const hotkeyLabel = formatForDisplay(
    useShortcutBinding("toggleSandboxPanel"),
  );
  const label = collapsed
    ? `${expandLabel} (${hotkeyLabel})`
    : `${collapseLabel} (${hotkeyLabel})`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="motion-press text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-[0.96]"
          onClick={onToggle}
          aria-label={label}
        >
          <CrossfadeIcon
            show={collapsed}
            variant="soft"
            trueKey="expand"
            falseKey="collapse"
            className="relative flex size-4 items-center justify-center"
            whenTrue={<IconLayoutSidebarRightExpand className="size-4" />}
            whenFalse={<IconLayoutSidebarRightCollapse className="size-4" />}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
