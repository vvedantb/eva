import type { MouseEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { springTransition } from "@vvedantb/ui";
import { EASE_OUT } from "./DeckPrimitives";
import { BRAND_CLASS } from "./deckTone";
import type { DeckBrand } from "./deckTone";
import { ACCENT } from "./motion/tokens";
import { DESIGN_H, DESIGN_W, useStageScale } from "./deckStage";

/** The deck routes a card may point at. All live under `/slides`. */
export type DeckPath =
  | "/slides/intro-to-eva"
  | "/slides/friday-session"
  | "/slides/annual-cdm"
  | "/slides/bee";

export interface DeckSummary {
  title: string;
  subtitle: string;
  path: DeckPath;
  slideCount: number;
  notedCount: number;
  preview: ReactNode;
  brand?: DeckBrand;
}

interface DeckCardProps {
  deck: DeckSummary;
  index: number;
}

/**
 * One deck on the index page. The thumbnail is the deck's real first slide,
 * rendered at the 1280×720 design size and scaled into a 16:9 box, so it can
 * never drift from the deck itself.
 */
export function DeckCard({ deck, index }: DeckCardProps) {
  const { scale: stageScale, measure: measureStage } = useStageScale();

  function stopCardClick(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      animate={{
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: { duration: 0.5, ease: EASE_OUT, delay: index * 0.08 },
      }}
      whileHover={{ y: -4, transition: springTransition }}
      whileTap={{ scale: 0.96, transition: springTransition }}
      className={cn(
        "group relative rounded-[28px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm",
        BRAND_CLASS[deck.brand ?? "eva"],
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[29px] opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-60"
        style={{
          background: `linear-gradient(120deg, ${ACCENT.a}, ${ACCENT.b})`,
        }}
      />

      <Link
        to={deck.path}
        aria-label={`Present ${deck.title}`}
        className="absolute inset-0 z-10 rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      />

      <div
        ref={measureStage}
        aria-hidden
        className="pointer-events-none relative aspect-video overflow-hidden rounded-[12px] border border-white/10 bg-zinc-950"
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${stageScale})`,
            transformOrigin: "top left",
          }}
          className="absolute top-0 left-0"
        >
          {deck.preview}
        </div>
      </div>

      <div className="relative px-1 pt-5 pb-1">
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">
          {deck.title}
        </h2>
        <p className="mt-1 text-white/55">{deck.subtitle}</p>
        <p className="mt-3 text-xs text-white/40">
          {deck.slideCount} slides · {deck.notedCount} with notes
        </p>

        <Link
          to={deck.path}
          search={{ view: "presenter" }}
          onClick={stopCardClick}
          className="hit-target motion-press relative z-20 mt-5 inline-flex rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white active:scale-[0.96]"
        >
          Speaker notes
        </Link>
      </div>
    </m.div>
  );
}
