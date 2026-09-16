import type { DeckSlide } from "./types";
import { AnnualTitle } from "./annual/a01-title";
import { AnnualOrigin } from "./annual/a02-origin";
import { AnnualNumbers } from "./annual/a03-numbers";
import { AnnualAdoption } from "./annual/a04-adoption";
import { Slide09Team } from "./09-team";
import { AnnualImpact } from "./annual/a06-impact";
import { AnnualHow } from "./annual/a07-how";
import { AnnualAhead } from "./annual/a08-ahead";
import { Slide15Closing } from "./15-closing";

/** Annual CDM deck order. The index here is the slide number minus one. */
export const ANNUAL_SLIDES: DeckSlide[] = [
  { id: "a01-title", title: "Title", Component: AnnualTitle, steps: 0 },
  {
    id: "a02-origin",
    title: "Where it started",
    Component: AnnualOrigin,
    steps: 3,
  },
  {
    id: "a03-numbers",
    title: "The year in numbers",
    Component: AnnualNumbers,
    steps: 1,
  },
  {
    id: "a04-adoption",
    title: "How it took hold",
    Component: AnnualAdoption,
    steps: 2,
  },
  { id: "09-team", title: "The team", Component: Slide09Team, steps: 4 },
  { id: "a06-impact", title: "Impact", Component: AnnualImpact, steps: 3 },
  { id: "a07-how", title: "How it works", Component: AnnualHow, steps: 2 },
  {
    id: "a08-ahead",
    title: "The year ahead",
    Component: AnnualAhead,
    steps: 2,
  },
  { id: "15-closing", title: "Closing", Component: Slide15Closing, steps: 0 },
];
