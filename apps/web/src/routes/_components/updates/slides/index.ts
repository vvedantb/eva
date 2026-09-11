import type { ComponentType } from "react";
import { Slide01Title } from "./01-title";
import { Slide02Numbers } from "./02-numbers";
import { Slide03Cloud } from "./03-cloud";
import { Slide04Sessions } from "./04-sessions";
import { Slide05SimpleMode } from "./05-simple-mode";
import { Slide06Automerge } from "./06-automerge";
import { Slide07Sandbox } from "./07-sandbox";
import { Slide08More } from "./08-more";
import { Slide09Team } from "./09-team";
import { Slide10Closing } from "./10-closing";

export interface DeckSlide {
  /** Stable id, mirrors the file name. */
  id: string;
  /** Shown in the outline panel. */
  title: string;
  Component: ComponentType;
  /** Number of extra build steps after the slide's resting state. */
  steps: number;
}

/** Deck order. The index here is the slide number minus one. */
export const SLIDES: DeckSlide[] = [
  { id: "01-title", title: "Title", Component: Slide01Title, steps: 0 },
  // TODO(slide-agents): content slides 02–08 are placeholders.
  {
    id: "02-numbers",
    title: "By the numbers",
    Component: Slide02Numbers,
    steps: 0,
  },
  {
    id: "03-cloud",
    title: "Eva in the cloud",
    Component: Slide03Cloud,
    steps: 2,
  },
  {
    id: "04-sessions",
    title: "Sessions",
    Component: Slide04Sessions,
    steps: 3,
  },
  {
    id: "05-simple-mode",
    title: "Simple mode",
    Component: Slide05SimpleMode,
    steps: 1,
  },
  {
    id: "06-automerge",
    title: "Auto-merge",
    Component: Slide06Automerge,
    steps: 2,
  },
  { id: "07-sandbox", title: "Sandboxes", Component: Slide07Sandbox, steps: 1 },
  { id: "08-more", title: "And more", Component: Slide08More, steps: 0 },
  // End TODO(slide-agents).
  { id: "09-team", title: "The team", Component: Slide09Team, steps: 4 },
  { id: "10-closing", title: "Closing", Component: Slide10Closing, steps: 0 },
];
