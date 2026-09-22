import type { DeckTheme } from "./DeckPrimitives";

/**
 * The deck's chrome sits on top of whichever surface the active slide uses, so
 * every overlay reads its colours from here rather than assuming a dark stage.
 * One map keeps the progress bar, the buttons and the share bar in step.
 */
export interface DeckTone {
  /** Page background behind the slide. */
  stage: string;
  /** Resting pill or bar surface, plus its hover. */
  surface: string;
  /** Icon buttons: resting muted, hover full strength. */
  control: string;
  /** Secondary text: counters, hints. */
  muted: string;
  /** Primary text on a chrome surface. */
  text: string;
  /** The progress bar's unfilled track. */
  track: string;
}

export const DECK_TONES: Record<DeckTheme, DeckTone> = {
  dark: {
    stage: "bg-zinc-950 text-white",
    surface: "bg-white/[0.07] hover:bg-white/[0.12]",
    control: "text-white/40 hover:text-white/80",
    muted: "text-white/45",
    text: "text-white/85",
    track: "bg-white/10",
  },
  light: {
    stage: "bg-zinc-50 text-zinc-900",
    surface: "bg-zinc-900/[0.06] hover:bg-zinc-900/[0.11]",
    control: "text-zinc-900/45 hover:text-zinc-900/80",
    muted: "text-zinc-900/50",
    text: "text-zinc-900/85",
    track: "bg-zinc-900/10",
  },
};
