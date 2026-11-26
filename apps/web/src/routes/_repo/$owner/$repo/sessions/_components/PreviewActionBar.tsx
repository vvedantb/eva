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
  IconMessages,
  IconPencil,
  IconPlayerPause,
} from "@tabler/icons-react";
import { previewCommentsDrawerWidth } from "./PreviewCommentsDrawer";
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
  comments,
}: {
  iframeElement: HTMLIFrameElement | null;
  /** True while something else owns the preview (Sketch, mini-player). */
  hidden: boolean;
  /** Omit where there is no chat to send an annotation to. */
  selectElement?: PreviewToggle;
  /** Omit where no composer can take the sketch image. */
  sketch?: PreviewToggle;
  /** The preview comments drawer; omitted with `selectElement`. */
  comments?: PreviewToggle & { count: number };
}) {
  const box = useIframeBox(iframeElement);
  const freeze = usePreviewFreeze(iframeElement);
  const screenshot = usePreviewScreenshot(iframeElement);
  // The iframe paints 0×0 while its pane is hidden.
  if (hidden || !box || box.width === 0 || box.height === 0) return null;
  // Centred over the part of the page the open drawer leaves visible.
  const visibleWidth =
    box.width - (comments?.active ? previewCommentsDrawerWidth(box) : 0);

  return createPortal(
    <div
      data-testid="preview-action-bar"
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full bg-popover/95 p-1 backdrop-blur-md smooth-shadow-ring-lg"
      style={{
        left: box.left + visibleWidth / 2,
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
      {comments ? (
        <PreviewActionButton
          icon={<IconMessages className="size-4" />}
          label="Comments"
          active={comments.active}
          onClick={comments.onToggle}
          badge={comments.count}
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
  badge = 0,
}: {
  icon: ReactNode;
  label: string;
  /** Toggles report their state; one-shot actions omit it. */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** A count shown on the button's corner; hidden at 0. */
  badge?: number;
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
            "relative",
            active && "bg-secondary text-primary hover:text-primary",
          )}
        >
          {icon}
          {badge > 0 ? (
            <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-2xs font-medium tabular-nums text-background">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
