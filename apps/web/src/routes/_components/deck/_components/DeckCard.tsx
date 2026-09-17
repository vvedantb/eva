import type { MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { motionSpring } from "@eva/ui";
import type { DeckSlide } from "../slides/types";
import { getSpeakerNotes } from "../speakerNotes";
import { BRAND, DeckStepContext, EASE_OUT } from "./DeckPrimitives";
import { DESIGN_H, DESIGN_W, useStageScale } from "./deckStage";

/** The deck routes a card may point at. Both share the same search schema. */
export type DeckPath = "/friday-session" | "/annual-cdm";

export interface DeckSummary {
  title: string;
  subtitle: string;
  path: DeckPath;
  slides: readonly DeckSlide[];
}

interface DeckCardProps {
  deck: DeckSummary;
  /** Position in the grid, used for the entrance stagger. */
  index: number;
}

function countWithNotes(slides: readonly DeckSlide[]): number {
  return slides.filter((slide) => getSpeakerNotes(slide.id).trim().length > 0)
    .length;
}

/**
 * One deck on the index page. The thumbnail is the deck's real first slide,
 * rendered at the 1280×720 design size and scaled into a 16:9 box, so it can
 * never drift from the deck itself.
 */
export function DeckCard({ deck, index }: DeckCardProps) {
  const stage = useStageScale();
  const First = deck.slides[0]?.Component;
  const withNotes = countWithNotes(deck.slides);

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
      whileHover={{ y: -4, transition: motionSpring }}
      className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-60"
        style={{
          background: `linear-gradient(120deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
      />

      {/* Card-wide target, kept a sibling of the notes link so no anchor nests. */}
      <Link
        to={deck.path}
        aria-label={`Present ${deck.title}`}
        className="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      />

      <div
        ref={stage.measure}
        aria-hidden
        className="pointer-events-none relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-zinc-950"
      >
        {First ? (
          <div
            style={{
              width: DESIGN_W,
              height: DESIGN_H,
              transform: `scale(${stage.scale})`,
              transformOrigin: "top left",
            }}
            className="absolute top-0 left-0"
          >
            <DeckStepContext value={0}>
              <First />
            </DeckStepContext>
          </div>
        ) : null}
      </div>

      {/* No z-index here: an auto z-index keeps the notes link's z-20 in the
          card's own stacking context, above the card-wide overlay link. */}
      <div className="relative px-1 pt-5 pb-1">
        <h2 className="text-2xl font-semibold tracking-[-0.01em]">
          {deck.title}
        </h2>
        <p className="mt-1 text-white/55">{deck.subtitle}</p>
        <p className="mt-3 text-xs text-white/40">
          {deck.slides.length} slides · {withNotes} with notes
        </p>

        <Link
          to={deck.path}
          search={{ view: "presenter" }}
          onClick={stopCardClick}
          className="relative z-20 mt-5 inline-flex rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
        >
          Speaker notes
        </Link>
      </div>
    </m.div>
  );
}
