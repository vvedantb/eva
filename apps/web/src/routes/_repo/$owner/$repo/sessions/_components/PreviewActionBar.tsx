"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";
import { IconClick, IconPencil } from "@tabler/icons-react";
import { useIframeBox } from "./useIframeBox";

interface PreviewAction {
  active: boolean;
  onToggle: () => void;
}

/**
 * Floating pill at the bottom of the preview for the page-pointing tools.
 * Icons only at rest so it covers little of the page; hover or keyboard focus
 * slides the labels open. Body portal (z-50) because the hosted iframe paints
 * in the fixed z-40 overlay, above anything inside the pane.
 */
export function PreviewActionBar({
  iframeElement,
  selectElement,
  sketch,
}: {
  iframeElement: HTMLIFrameElement | null;
  /** Omit where there is no chat to send an annotation to. */
  selectElement?: PreviewAction;
  /** Omit where no composer can take the sketch image. */
  sketch?: PreviewAction;
}) {
  const box = useIframeBox(iframeElement);
  // The iframe paints 0×0 while its pane is hidden.
  if (!box || box.width === 0 || box.height === 0) return null;
  if (!selectElement && !sketch) return null;

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
          action={selectElement}
        />
      ) : null}
      {sketch ? (
        <PreviewActionButton
          icon={<IconPencil className="size-4" />}
          label="Sketch"
          action={sketch}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function PreviewActionButton({
  icon,
  label,
  action,
}: {
  icon: ReactNode;
  label: string;
  action: PreviewAction;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={action.active}
      onClick={action.onToggle}
      className={cn(
        "h-7 gap-0 rounded-full px-1.5 max-sm:hit-target",
        action.active && "bg-secondary text-primary hover:text-primary",
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
