import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LogoMark } from "@/lib/components/LogoMark";
import { DeckAmbient } from "../_components/deck/_components/DeckAmbient";
import { DeckCard } from "../_components/deck/_components/DeckCard";
import type { DeckSummary } from "../_components/deck/_components/DeckCard";
import { DeckStepContext } from "../_components/deck/_components/DeckPrimitives";
import { getSpeakerNotes } from "../_components/deck/speakerNotes";
import type { DeckSlide } from "../_components/deck/slides/types";
import { FRIDAY_SLIDES } from "../_components/deck/slides/friday";
import { ANNUAL_SLIDES } from "../_components/deck/slides/annual";
import { INTRO_SLIDES } from "../_components/deck/slides/intro";

/**
 * Public, chrome-less index of the presentation decks. No auth guard and no app
 * shell: it is the page you open before plugging into a projector.
 */
export const Route = createFileRoute("/slides/")({
  staticData: { title: "Slides" },
  component: SlidesIndexPage,
});

/** A thumbnail for a deck on our own engine: its first slide, at rest. */
function deckPreview(slides: readonly DeckSlide[]): ReactNode {
  const First = slides[0]?.Component;
  if (!First) return null;
  return (
    <DeckStepContext value={0}>
      <First />
    </DeckStepContext>
  );
}

function countWithNotes(slides: readonly DeckSlide[]): number {
  return slides.filter((slide) => getSpeakerNotes(slide.id).trim().length > 0)
    .length;
}

const DECKS: readonly DeckSummary[] = [
  {
    title: "Intro to Eva",
    subtitle: "What Eva is, and how it works",
    path: "/slides/intro-to-eva",
    slideCount: INTRO_SLIDES.length,
    notedCount: countWithNotes(INTRO_SLIDES),
    preview: deckPreview(INTRO_SLIDES),
  },
  {
    title: "Friday session",
    subtitle: "The last three months",
    path: "/slides/friday-session",
    slideCount: FRIDAY_SLIDES.length,
    notedCount: countWithNotes(FRIDAY_SLIDES),
    preview: deckPreview(FRIDAY_SLIDES),
  },
  {
    title: "Annual CDM",
    subtitle: "Eva's first year, and its impact",
    path: "/slides/annual-cdm",
    slideCount: ANNUAL_SLIDES.length,
    notedCount: countWithNotes(ANNUAL_SLIDES),
    preview: deckPreview(ANNUAL_SLIDES),
  },
];

function SlidesIndexPage() {
  return (
    <div className="relative min-h-dvh bg-zinc-950 font-sans text-white">
      <DeckAmbient />

      <div className="relative z-10 mx-auto max-w-[1100px] px-6 py-24">
        <header className="mb-14">
          <LogoMark size={44} />
          <h1 className="mt-6 text-5xl font-semibold tracking-[-0.02em]">
            Presentations
          </h1>
          <p className="mt-3 text-white/55">
            Three decks, one place. Press a card to present.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-2">
          {DECKS.map((deck, index) => (
            <DeckCard key={deck.path} deck={deck} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
