"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@eva/ui";
import { Button, Spinner } from "@vvedantb/ui";
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
 * page. Icons only at rest so it covers little of the page; hover or keyboard
 * focus slides the labels open. Body portal (z-50) because the hosted iframe
 * paints in the fixed z-40 overlay, above anything inside the pane.
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
  /** True while something else owns the preview (Sketch, mini-player). */
  hidden: boolean;
  /** Omit where there is no chat to send an annotation to. */
  selectElement?: PreviewToggle;
  /** Omit where no composer can take the sketch image. */
  sketch?: PreviewToggle;
}) {
  const box = useIframeBox(iframeElement);
  const freeze = usePreviewFreeze(iframeElement);
  const screenshot = usePreviewScreenshot(iframeElement);
  // The iframe paints 0×0 while its pane is hidden.
  if (hidden || !box || box.width === 0 || box.height === 0) return null;

  return createPortal(
    <div
      data-testid="preview-action-bar"
      className="group/bar fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full bg-popover/95 p-1 backdrop-blur-md smooth-shadow-ring-lg"
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
  /** Toggles report their state; one-shot actions omit it. */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 gap-0 rounded-full px-1.5 max-sm:hit-target",
        active && "bg-secondary text-primary hover:text-primary",
      )}
    >
      {icon}
      {/* 0fr → 1fr animates the label to its own width without measuring. */}
      <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-focus-within/bar:grid-cols-[1fr] group-hover/bar:grid-cols-[1fr] motion-reduce:transition-none">
        <span className="overflow-hidden whitespace-nowrap">
          <span className="pl-1.5">{label}</span>
        </span>
      </span>
    </Button>
  );
}
