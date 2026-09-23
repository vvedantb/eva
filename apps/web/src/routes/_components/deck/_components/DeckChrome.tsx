import { AnimatePresence, m } from "motion/react";
import {
  IconLayoutSidebarLeftExpand,
  IconLoader2,
  IconNotes,
  IconShare,
} from "@tabler/icons-react";
import { cn, motionFast, motionSlow } from "@eva/ui";
import type { DeckTheme } from "./DeckPrimitives";
import { DECK_TONES } from "./deckTone";
import { DeckShareBar } from "./DeckShareBar";
import type { LiveShare } from "./useLiveShare";

interface DeckChromeProps {
  slide: number;
  total: number;
  theme: DeckTheme;
  share: LiveShare;
  /** The deck's own route path, used to build the join link. */
  basePath: string;
  onToggleOutline: () => void;
  onOpenPresenter: () => void;
}

/** Progress bar, counter, outline, notes and share toggles, first-slide hint. */
export function DeckChrome({
  slide,
  total,
  theme,
  share,
  basePath,
  onToggleOutline,
  onOpenPresenter,
}: DeckChromeProps) {
  const pct = `${(slide / total) * 100}%`;
  const tone = DECK_TONES[theme];
  const idle = share.sessionState === "none";
  // 40×40 is the comfortable-tap floor, so the box is the target rather than a
  // 30px icon pad. `motion-press` names the properties it animates (transform,
  // scale and colour) — never `all`.
  const control = cn(
    "pointer-events-auto absolute bottom-2 inline-flex size-10 items-center justify-center rounded-[12px]",
    "motion-press active:scale-[0.96]",
    tone.control,
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className={cn("absolute right-0 bottom-0 left-0 h-0.5", tone.track)}>
        <m.div
          className="h-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]"
          animate={{ width: pct }}
          transition={motionSlow}
        />
      </div>

      <div
        className={cn(
          "absolute right-6 bottom-4 font-mono text-xs tabular-nums",
          tone.muted,
        )}
      >
        {slide} / {total}
      </div>

      <button
        type="button"
        onClick={onToggleOutline}
        aria-label="Toggle outline"
        className={cn(control, "left-3")}
      >
        <IconLayoutSidebarLeftExpand size={18} />
      </button>

      <button
        type="button"
        onClick={onOpenPresenter}
        aria-label="Open presenter view"
        className={cn(control, "left-15")}
      >
        <IconNotes size={18} />
      </button>

      {idle && (
        <button
          type="button"
          onClick={() => void share.startSharing()}
          disabled={share.isStarting}
          aria-label="Share this deck live"
          className={cn(control, "left-27")}
        >
          {share.isStarting ? (
            <IconLoader2 size={18} className="animate-spin" />
          ) : (
            <IconShare size={18} />
          )}
        </button>
      )}

      <DeckShareBar share={share} basePath={basePath} theme={theme} />

      <AnimatePresence>
        {slide === 1 && idle && (
          <m.div
            key="hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            // Leaving is quieter than arriving: half the travel, half the time.
            exit={{ opacity: 0, y: 4, transition: motionFast }}
            transition={motionSlow}
            className={cn(
              "absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs",
              tone.surface,
              tone.muted,
            )}
          >
            ← → navigate · F fullscreen · O outline · P notes
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
