"use client";

import { useId, useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import { IconX } from "@tabler/icons-react";
import { AveStatePip } from "@/lib/components/ave/AveActiveDot";
import { AveEyes } from "@/lib/components/ave/AveEyes";
import { AveQuestionsBadge } from "@/lib/components/ave/AveQuestionsBadge";
import { AveMark } from "@/lib/components/ave/AveMark";
import {
  aveLogoState,
  type AveLogoState,
} from "@/lib/components/ave/aveLogoState";
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
  const stateLabelId = useId();
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
          aria-describedby={isOpen ? undefined : stateLabelId}
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
            // AveMark clips the star. The working pip hangs off the corner
            // like a rail tile, so this circle must not clip descendants.
            isOpen
              ? "bg-popover/95 text-popover-foreground backdrop-blur-md"
              : "bg-transparent",
          )}
        >
          {/* Open → a close affordance: the mark says "summon Ave", but once the
              panel is up the same button dismisses it, and an unchanged glyph
              reads as "open it again". Both glyphs stay mounted so the swap
              can crossfade instead of teleporting. The pip rides the Eva layer
              so it leaves with the mark. */}
          <span className="relative size-full">
            <span
              className={cn(
                GLYPH_LAYER,
                isOpen ? "scale-90 opacity-0" : "scale-100 opacity-100",
              )}
              aria-hidden={isOpen}
            >
              <QueryErrorBoundary
                fallback={<AveFace state="idle" labelId={stateLabelId} />}
              >
                <AveLiveFace labelId={stateLabelId} />
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

/** The CSS animation that times the done/error one-shots; see globals.css. */
const ONE_SHOT_ANIMATION = "ave-hold";

/**
 * The launcher's face: mark, eyes and corner cues for one `AveLogoState`.
 * `data-ave-state` drives every animation from globals.css, so the state is
 * the only thing React decides. A one-shot reports its end through
 * `onOneShotEnd` when its `ave-hold` timer runs out.
 */
function AveFace({
  state,
  labelId,
  onOneShotEnd,
  children,
}: {
  state: AveLogoState;
  labelId: string;
  onOneShotEnd?: () => void;
  children?: ReactNode;
}) {
  return (
    <span
      data-ave-state={state}
      className="ave-face relative size-full"
      onAnimationEnd={(event) => {
        if (event.animationName === ONE_SHOT_ANIMATION) onOneShotEnd?.();
      }}
    >
      {state === "waiting" && (
        <span className="ave-halo absolute inset-0 rounded-full" />
      )}
      <span className="ave-mark absolute inset-0">
        <AveMark state={state} className="size-full" />
        <AveEyes state={state} />
      </span>
      <AveStatePip state={state} labelId={labelId} />
      {children}
    </span>
  );
}

function AveLiveFace({ labelId }: { labelId: string }) {
  const { state, clearOneShot } = useAveLogoState();
  return (
    <AveFace state={state} labelId={labelId} onOneShotEnd={clearOneShot}>
      <AveQuestionsBadge />
    </AveFace>
  );
}

/**
 * Subscribes to Ave's thread, live activity, transcript and waiting
 * questions, and derives the face. Each query is shared with `useAveChat` and
 * the badge through the cached `useQuery`, so nothing subscribes twice.
 *
 * Done and error play only on a running → idle edge seen while mounted, never
 * on first load. The edge is caught during render by comparing against the
 * last status seen; whether the run failed is read at that moment, from the
 * alert row `_ave/run.ts` writes in the same mutation that idles the thread.
 */
function useAveLogoState() {
  const thread = useQuery(api.ave.getThread, {});
  const streaming = useQuery(api.ave.getStreaming, {});
  const messages = useQuery(api.ave.listMessages, {});
  const waitingCount = useQuery(api.routedThreads.countWaitingForMe, {});
  const status = thread?.status;
  const [seenStatus, setSeenStatus] = useState(status);
  const [finished, setFinished] = useState<{ errored: boolean } | null>(null);
  if (status !== seenStatus) {
    setSeenStatus(status);
    const last = messages?.[messages.length - 1];
    setFinished(
      seenStatus === "running" && status === "idle"
        ? {
            errored:
              last?.isSystemAlert === true && last.errorDetail !== undefined,
          }
        : null,
    );
  }
  return {
    state: aveLogoState({
      threadStatus: status,
      currentActivity: streaming?.currentActivity,
      waitingCount,
      justFinished: finished !== null,
      lastRunErrored: finished?.errored === true,
    }),
    clearOneShot: () => setFinished(null),
  };
}
