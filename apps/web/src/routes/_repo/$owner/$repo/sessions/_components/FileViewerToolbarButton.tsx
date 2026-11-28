"use client";

import type { ReactNode } from "react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";

/** Shared so the viewer header's icon buttons cannot drift apart. */
export const VIEWER_ICON_BUTTON_CLASS =
  "max-sm:hit-target size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

interface FileViewerToolbarButtonProps {
  label: string;
  tooltip?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Compact icon button for the file viewer header's toolbar. */
export function FileViewerToolbarButton({
  label,
  tooltip,
  pressed,
  disabled,
  onClick,
  children,
}: FileViewerToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          shape="rounded"
          size="sm"
          variant="ghost"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          className={
            pressed === true
              ? `${VIEWER_ICON_BUTTON_CLASS} bg-secondary text-foreground`
              : VIEWER_ICON_BUTTON_CLASS
          }
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
