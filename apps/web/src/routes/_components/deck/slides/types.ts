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
}
