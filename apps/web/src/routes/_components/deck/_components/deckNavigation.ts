import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { DeckSlide } from "../slides/types";

/**
 * Where the build is up to, plus which slide that build belongs to and which
 * way we travelled to get there. Keeping all three in one state object is what
 * lets an external slide change (URL, outline click, browser back) implicitly
 * reset the build to step 0 without an effect.
 */
interface DeckState {
  slide: number;
  step: number;
  direction: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

export interface DeckNavigation {
  /** The slide being shown, already clamped to the deck. */
  entry: DeckSlide;
  total: number;
  step: number;
  direction: number;
  goTo: (target: number) => void;
  next: () => void;
  prev: () => void;
  /** Jumps to a slide *and* a build step, for the other window's messages. */
  applyRemote: (slide: number, step: number) => void;
}

/**
 * The deck's step/slide machine, shared by the stage and the presenter view so
 * both advance builds identically.
 *
 * `onMove` fires for moves this window made, with the position it moved to —
 * never for `applyRemote`. Announcing from the move rather than from a render
 * matters: `onNavigate` lands a render later, so a render-driven broadcast
 * would leak the half-updated position in between.
 */
export function useDeckNavigation(
  slides: readonly DeckSlide[],
  slide: number,
  onNavigate: (slide: number) => void,
  onMove: (slide: number, step: number) => void,
): DeckNavigation {
  const [deckState, setDeckState] = useState<DeckState>({
    slide,
    step: 0,
    direction: 1,
  });

  const total = slides.length;
  const onCurrentSlide = deckState.slide === slide;
  const step = onCurrentSlide ? deckState.step : 0;
  const direction = onCurrentSlide
    ? deckState.direction
    : slide >= deckState.slide
      ? 1
      : -1;
  const entry = slides[clamp(slide - 1, 0, total - 1)];

  function goTo(target: number) {
    const destination = clamp(target, 1, total);
    if (destination === slide) return;
    setDeckState({
      slide: destination,
      step: 0,
      direction: destination >= slide ? 1 : -1,
    });
    onNavigate(destination);
    onMove(destination, 0);
  }

  function next() {
    if (step < entry.steps) {
      setDeckState({ slide, step: step + 1, direction });
      onMove(slide, step + 1);
      return;
    }
    if (slide < total) goTo(slide + 1);
  }

  function prev() {
    if (step > 0) {
      setDeckState({ slide, step: step - 1, direction });
      onMove(slide, step - 1);
      return;
    }
    if (slide <= 1) return;
    // Step back onto the *finished* previous slide rather than replaying its build.
    const resting = slides[slide - 2].steps;
    setDeckState({ slide: slide - 1, step: resting, direction: -1 });
    onNavigate(slide - 1);
    onMove(slide - 1, resting);
  }

  function applyRemote(remoteSlide: number, remoteStep: number) {
    const destination = clamp(remoteSlide, 1, total);
    setDeckState({
      slide: destination,
      step: clamp(remoteStep, 0, slides[destination - 1].steps),
      direction: destination >= slide ? 1 : -1,
    });
    if (destination !== slide) onNavigate(destination);
  }

  return { entry, total, step, direction, goTo, next, prev, applyRemote };
}

/**
 * The navigation half of the deck's keyboard map: step first, then slide.
 * Returns whether the key was consumed, so callers can layer their own keys on
 * top without repeating this list.
 */
export function handleStepKey(
  event: KeyboardEvent<HTMLElement>,
  nav: DeckNavigation,
): boolean {
  switch (event.key) {
    case "ArrowRight":
    case " ":
    case "PageDown":
    case "j":
      event.preventDefault();
      nav.next();
      return true;
    case "ArrowLeft":
    case "PageUp":
    case "k":
      event.preventDefault();
      nav.prev();
      return true;
    case "Home":
      event.preventDefault();
      nav.goTo(1);
      return true;
    case "End":
      event.preventDefault();
      nav.goTo(nav.total);
      return true;
    default:
      return false;
  }
}
