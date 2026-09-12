"use client";

import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import { IconX } from "@tabler/icons-react";
import { AveActiveDot } from "@/lib/components/ave/AveActiveDot";
import { AveMark } from "@/lib/components/ave/AveMark";
import {
  LAUNCHER_POSITION_STYLE,
  type AveLauncherDragHandlers,
} from "@/lib/components/ave/useAveLauncherPosition";
import { QueryErrorBoundary } from "@/lib/components/QueryErrorBoundary";

const GLYPH_LAYER =
  "pointer-events-none absolute inset-0 flex items-center justify-center transition-[opacity,scale] duration-[var(--motion-fast)]";

/**
 * The floating summon button, bottom-right of the signed-in shell until the user
 * drags it elsewhere. Closed, it *is* Eva's mark — Ave is Eva herself, so the
 * launcher is the app icon, not a toolbar glyph on glass. Open, the same circle
 * becomes the close control.
 *
 * Desktop only. On a phone the bottom-right corner is where the chat composer's
 * send button, the plan-question action row and row-level actions all live, and
 * a 48px disc floating over them makes them untappable — so below `lg` the
 * summon affordance is `AveHeaderButton` in the mobile header instead.
 */
export function AveLauncherButton({
  isOpen,
  onToggle,
  onIntent,
  dragHandlers,
  isDragging,
  shouldIgnoreClick,
}: {
  isOpen: boolean;
  onToggle: () => void;
  /** Hover/focus — start the chat chunk before the first click. */
  onIntent?: () => void;
  dragHandlers: AveLauncherDragHandlers;
  isDragging: boolean;
  /** True for the click the browser fires after a drop; see the hook. */
  shouldIgnoreClick: () => boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          {...dragHandlers}
          onClick={() => {
            if (shouldIgnoreClick()) return;
            onToggle();
          }}
          onMouseEnter={onIntent}
          onFocus={onIntent}
          aria-label={isOpen ? "Close Manager Ave" : "Manager Ave"}
          aria-expanded={isOpen}
          style={LAUNCHER_POSITION_STYLE}
          className={cn(
            "motion-press fixed z-50",
            "hidden lg:flex size-12 items-center justify-center rounded-full",
            "smooth-shadow-ring-lg active:scale-[0.94]",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40",
            // Touch drags must not scroll the page out from under the pointer.
            "touch-none",
            // Nudging the button under the cursor while it is being dragged
            // reads as the drag lagging, so hover growth is dropped mid-drag.
            isDragging ? "cursor-grabbing" : "cursor-grab hover:scale-[1.03]",
            // AveMark clips the star. The sandbox pip hangs off the corner
            // like a rail tile, so this circle must not clip descendants.
            isOpen
              ? "bg-popover/95 text-popover-foreground backdrop-blur-md"
              : "bg-transparent",
          )}
        >
          {/* Open → a close affordance: the mark says "summon Ave", but once the
              panel is up the same button dismisses it, and an unchanged glyph
              reads as "open it again". Both glyphs stay mounted so the swap
              can crossfade instead of teleporting. The dot rides the Eva layer
              so it leaves with the mark. */}
          <span className="relative size-full">
            <span
              className={cn(
                GLYPH_LAYER,
                isOpen ? "scale-90 opacity-0" : "scale-100 opacity-100",
              )}
              aria-hidden={isOpen}
            >
              <AveMark className="size-full" />
              <QueryErrorBoundary>
                <AveActiveDot />
              </QueryErrorBoundary>
            </span>
            <span
              className={cn(
                GLYPH_LAYER,
                isOpen ? "scale-100 opacity-100" : "scale-90 opacity-0",
              )}
              aria-hidden={!isOpen}
            >
              <IconX size={22} className="shrink-0" />
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {isOpen ? "Close" : "Manager Ave"}
      </TooltipContent>
    </Tooltip>
  );
}
