import { createFileRoute } from "@tanstack/react-router";
import { LogoMark } from "@/lib/components/LogoMark";
import { DeckAmbient } from "./_components/deck/_components/DeckAmbient";
import { DeckCard } from "./_components/deck/_components/DeckCard";
import type { DeckSummary } from "./_components/deck/_components/DeckCard";
import { FRIDAY_SLIDES } from "./_components/deck/slides/friday";
import { ANNUAL_SLIDES } from "./_components/deck/slides/annual";

/**
 * Public, chrome-less index of the presentation decks. No auth guard and no app
 * shell: it is the page you open before plugging into a projector.
 */
export const Route = createFileRoute("/slides")({
  staticData: { title: "Slides" },
  component: SlidesIndexPage,
});

const DECKS: readonly DeckSummary[] = [
  {
    title: "Friday session",
    subtitle: "The last three months",
    path: "/friday-session",
    slides: FRIDAY_SLIDES,
  },
  {
    title: "Annual CDM",
    subtitle: "Eva's first year, and its impact",
    path: "/annual-cdm",
    slides: ANNUAL_SLIDES,
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
            Two decks on the same engine. Press a card to present.
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
