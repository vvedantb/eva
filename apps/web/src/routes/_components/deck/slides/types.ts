import type { ComponentType } from "react";

export interface DeckSlide {
  /** Stable id, mirrors the file name. */
  id: string;
  /** Shown in the outline panel. */
  title: string;
  Component: ComponentType;
  /** Number of extra build steps after the slide's resting state. */
  steps: number;
}
