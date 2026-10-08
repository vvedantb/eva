import {
  IconArrowsDiagonal,
  IconGripHorizontal,
  IconX,
} from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import type { PointerGestureHandlers } from "../usePreviewMiniPlayerFrame";

const BUTTON_CLASS =
  "motion-press flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground active:scale-[0.9] hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * Title bar of the floating preview: the whole bar is the drag handle, so the
 * buttons stop pointer-down from starting a move.
 */
export function PreviewMiniPlayerChrome({
  title,
  moveHandlers,
  isMoving,
  onExpand,
  onClose,
}: {
  title: string;
  moveHandlers: PointerGestureHandlers;
  isMoving: boolean;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div
      {...moveHandlers}
      className={cn(
        "flex shrink-0 select-none items-center gap-1.5 bg-muted px-2 py-1.5 touch-none",
        isMoving ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <IconGripHorizontal
        size={14}
        className="shrink-0 text-muted-foreground/70"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {title}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onExpand}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Expand preview"
            className={BUTTON_CLASS}
          >
            <IconArrowsDiagonal size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Back to session</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Close preview"
            className={BUTTON_CLASS}
          >
            <IconX size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close</TooltipContent>
      </Tooltip>
    </div>
  );
}
