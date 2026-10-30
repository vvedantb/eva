import type { ComponentType } from "react";
import type { DeckTheme } from "../_components/DeckPrimitives";

export interface DeckSlide {
  /** Stable id, mirrors the file name. */
  id: string;
  /** Shown in the outline panel. */
  title: string;
  Component: ComponentType;
  /** Number of extra build steps after the slide's resting state. */
  steps: number;
  /** The surface this slide is painted on. Dark when absent. */
  theme?: DeckTheme;
  /**
   * Continues an element from the slide before it (a shared `layoutId`). The
   * stage then cross-fades between the two slides instead of flying, so the
   * shared element can glide from one place to the other on a still stage.
   */
  morph?: boolean;
  /**
   * Milliseconds to wait before each auto-played build step, one per step.
   * For builds that need reading time; the deck's default gaps otherwise.
   */
  autoMs?: readonly number[];
  /** A blank lead-in before the title, so its entrance plays live. Index thumbnails skip it. */
  blank?: boolean;
}
