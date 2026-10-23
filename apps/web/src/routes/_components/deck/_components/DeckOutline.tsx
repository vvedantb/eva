import { AnimatePresence, m } from "motion/react";
import { cn, motionFast, motionSpring } from "@eva/ui";
import type { DeckSlide } from "../slides/types";

interface DeckOutlineProps {
  slides: readonly DeckSlide[];
  open: boolean;
  slide: number;
  onNavigate: (slide: number) => void;
  onClose: () => void;
}

/** Left drawer listing every slide. Picking one jumps there and closes the drawer. */
export function DeckOutline({
  slides,
  open,
  slide,
  onNavigate,
  onClose,
}: DeckOutlineProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.nav
          key="deck-outline"
          initial={{ x: -288, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          // The drawer travels its full width in, but only a token distance
          // out: a long exit holds the stage hostage after the choice is made.
          exit={{ x: -24, opacity: 0, transition: motionFast }}
          transition={motionSpring}
          // Concentric: 24px outer corner = 8px row corner + the 16px of
          // padding between the two. Explicit pixels, because the `rounded-*`
          // scale is derived from a user-settable `--radius`.
          className="pointer-events-auto z-20 flex w-72 shrink-0 flex-col gap-1 overflow-y-auto rounded-r-[24px] bg-zinc-900/90 p-4 backdrop-blur-md"
          aria-label="Slide outline"
        >
          {slides.map((entry, index) => {
            const number = index + 1;
            const active = number === slide;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  onNavigate(number);
                  onClose();
                }}
                className={cn(
                  // py-2.5 on a 20px line is a 40px row — the tap floor.
                  "flex min-h-10 items-center gap-3 rounded-[8px] px-3 py-2.5 text-left text-sm text-white/70",
                  "motion-press active:scale-[0.96]",
                  "hover:bg-white/5 hover:text-white",
                  active && "bg-white/10 text-white",
                )}
                aria-current={active ? "true" : undefined}
              >
                <span className="font-mono text-xs tabular-nums text-white/30">
                  {String(number).padStart(2, "0")}
                </span>
                <span className="truncate">{entry.title}</span>
              </button>
            );
          })}
        </m.nav>
      )}
    </AnimatePresence>
  );
}
