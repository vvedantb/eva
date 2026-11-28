import type { ComponentType } from "react";
import type { DeckTheme } from "../_components/DeckPrimitives";
import type { DeckSection } from "../_components/deckTone";

export interface DeckSlide {
  id: string;
  title: string;
  Component: ComponentType;
  steps: number;
  theme?: DeckTheme;
  section?: DeckSection;
  morph?: boolean;
  autoMs?: readonly number[];
  blank?: boolean;
}
