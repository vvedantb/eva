import { createContext, use } from "react";

/**
 * The current build step of the active slide. 0 = the slide's resting state,
 * before the presenter has clicked. `Deck` provides it; the default of 0
 * means a slide rendered on its own still shows its step-0 content.
 */
export const DeckStepContext = createContext<number>(0);

export function useDeckStep(): number {
  return use(DeckStepContext);
}

/** Light or dark slides sit in the same deck. */
export type DeckTheme = "dark" | "light";

/**
 * The surface the active slide is painted on. `Deck`, `PresenterView` and the
 * index page's preview boxes all provide it, so a slide picks its own text
 * colours from here rather than assuming the deck is dark.
 */
export const DeckThemeContext = createContext<DeckTheme>("dark");

export function useDeckTheme(): DeckTheme {
  return use(DeckThemeContext);
}

/**
 * When the nearest `Reveal` or `Stagger` shows its children, and after what
 * delay. Self-animating primitives (`Title`, `Accent`, `Card` and the
 * motion kit) read it, so a title inside `<Reveal step={2} delay={0.3}>` masks
 * in on step 2 at 0.3 s without being told twice. Outside any reveal the cue
 * is "on, now".
 */
export interface MotionCue {
  on: boolean;
  delay: number;
}

export const MotionCueContext = createContext<MotionCue>({
  on: true,
  delay: 0,
});

/**
 * Resolves when a primitive should play. An explicit `step` wins and starts
 * the clock at the primitive's own `delay`; without one, the primitive follows
 * the enclosing `Reveal`/`Stagger` and adds its `delay` on top of theirs.
 */
export function useMotionCue(step?: number, delay = 0): MotionCue {
  const cue = use(MotionCueContext);
  const deckStep = useDeckStep();
  if (step !== undefined) return { on: deckStep >= step, delay };
  return { on: cue.on, delay: cue.delay + delay };
}

/** The foreground ink per surface, as an `r,g,b` triple. */
const INK_RGB: Record<DeckTheme, string> = {
  dark: "255,255,255",
  light: "24,24,27",
};

/**
 * The slide's foreground at an alpha: white on dark slides, zinc-900 on light
 * ones. It mirrors the `--color-white` swap `.deck-ink-light` makes for class
 * names, for colours that live in JS — SVG strokes and animated values.
 */
export function useInk(): (alpha: number) => string {
  const rgb = INK_RGB[useDeckTheme()];
  return (alpha) => `rgba(${rgb},${alpha})`;
}

/**
 * The class an app window inside a slide takes: the app's dark theme on a dark
 * slide, its light theme on a light one, so a window always matches its stage.
 */
export function useAppScheme(): string {
  return useDeckTheme() === "light" ? "deck-app-light" : "dark";
}
