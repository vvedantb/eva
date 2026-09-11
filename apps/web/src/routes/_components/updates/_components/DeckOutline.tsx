import { AnimatePresence, m } from "motion/react";
import { cn, motionSpring } from "@eva/ui";
import { SLIDES } from "../slides/index";

interface DeckOutlineProps {
  open: boolean;
  slide: number;
  onNavigate: (slide: number) => void;
  onClose: () => void;
}

/** Left drawer listing every slide. Picking one jumps there and closes the drawer. */
export function DeckOutline({
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
          exit={{ x: -288, opacity: 0 }}
          transition={motionSpring}
          className="pointer-events-auto z-20 flex w-72 shrink-0 flex-col gap-1 overflow-y-auto bg-zinc-900/90 p-4 backdrop-blur-md"
          aria-label="Slide outline"
        >
          {SLIDES.map((entry, index) => {
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/70 transition-colors",
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
