import { AnimatePresence, m } from "motion/react";
import { IconLayoutSidebarLeftExpand, IconNotes } from "@tabler/icons-react";
import { motionSlow } from "@eva/ui";

interface DeckChromeProps {
  slide: number;
  total: number;
  onToggleOutline: () => void;
  onOpenPresenter: () => void;
}

/** Progress bar, counter, outline and presenter toggles, first-slide hint. */
export function DeckChrome({
  slide,
  total,
  onToggleOutline,
  onOpenPresenter,
}: DeckChromeProps) {
  const pct = `${(slide / total) * 100}%`;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-white/10">
        <m.div
          className="h-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]"
          animate={{ width: pct }}
          transition={motionSlow}
        />
      </div>

      <div className="absolute right-6 bottom-4 font-mono text-xs tabular-nums text-white/40">
        {slide} / {total}
      </div>

      <button
        type="button"
        onClick={onToggleOutline}
        aria-label="Toggle outline"
        className="pointer-events-auto absolute bottom-3 left-4 rounded-md p-1.5 text-white/40 transition-colors hover:text-white/80"
      >
        <IconLayoutSidebarLeftExpand size={18} />
      </button>

      <button
        type="button"
        onClick={onOpenPresenter}
        aria-label="Open presenter view"
        className="pointer-events-auto absolute bottom-3 left-12 rounded-md p-1.5 text-white/40 transition-colors hover:text-white/80"
      >
        <IconNotes size={18} />
      </button>

      <AnimatePresence>
        {slide === 1 && (
          <m.div
            key="hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionSlow}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/[0.06] px-4 py-1.5 text-xs text-white/45"
          >
            ← → navigate · F fullscreen · O outline · P notes
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
