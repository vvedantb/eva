"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@eva/ui";
import {
  Button,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import {
  IconCamera,
  IconClick,
  IconPencil,
  IconPlayerPause,
} from "@tabler/icons-react";
import { useIframeBox } from "./useIframeBox";
import { usePreviewFreeze } from "./usePreviewFreeze";
import { usePreviewScreenshot } from "./usePreviewScreenshot";

interface PreviewToggle {
  active: boolean;
  onToggle: () => void;
}

/**
 * Floating pill at the bottom of the preview for the tools that act on the
 * page. Icons only, labels in tooltips: the bar never changes width, so a
 * button never slides out from under the pointer. Body portal (z-50) because
 * the hosted iframe paints in the fixed z-40 overlay, above the pane.
 *
 * Stays mounted while `hidden` so the freeze state survives Sketch and
 * pop-out: the page stays frozen, and the button must still say so.
 */
export function PreviewActionBar({
  iframeElement,
  hidden,
  selectElement,
  sketch,
}: {
  iframeElement: HTMLIFrameElement | null;
  hidden: boolean;
  selectElement?: PreviewToggle;
  sketch?: PreviewToggle;
}) {
  const box = useIframeBox(iframeElement);
  const freeze = usePreviewFreeze(iframeElement);
  const screenshot = usePreviewScreenshot(iframeElement);
  if (hidden || !box || box.width === 0 || box.height === 0) return null;

  return createPortal(
    <div
      data-testid="preview-action-bar"
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full bg-popover/95 p-1 backdrop-blur-md smooth-shadow-ring-lg"
      style={{
        left: box.left + box.width / 2,
        top: box.top + box.height - 12,
      }}
    >
      {selectElement ? (
        <PreviewActionButton
          icon={<IconClick className="size-4" />}
          label="Select element"
          active={selectElement.active}
          onClick={selectElement.onToggle}
        />
      ) : null}
      <PreviewActionButton
        icon={<IconPlayerPause className="size-4" />}
        label="Freeze animations"
        active={freeze.frozen}
        onClick={freeze.toggle}
      />
      {sketch ? (
        <PreviewActionButton
          icon={<IconPencil className="size-4" />}
          label="Sketch"
          active={sketch.active}
          onClick={sketch.onToggle}
        />
      ) : null}
      <PreviewActionButton
        icon={
          screenshot.capturing ? (
            <Spinner size="sm" />
          ) : (
            <IconCamera className="size-4" />
          )
        }
        label="Screenshot"
        disabled={screenshot.capturing}
        onClick={screenshot.capture}
      />
    </div>,
    document.body,
  );
}

function PreviewActionButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            active && "bg-secondary text-primary hover:text-primary",
          )}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
