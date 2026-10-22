import type { DeckSlide } from "./types";
import { BeeTitle } from "./bee/b01-title";
import { BeeProblem } from "./bee/b02-problem";
import { BeeNotch } from "./bee/b03-notch";
import { BeeListens } from "./bee/b04-listens";
import { BeeWeb } from "./bee/b05-web";
import { BeeRealMeeting } from "./bee/b11-real-meeting";
import { BeeSummary } from "./bee/b06-summary";
import { BeeTeams } from "./bee/b07-teams";
import { BeePrivate } from "./bee/b08-private";
import { BeeTools } from "./bee/b09-tools";
import { BeeClose } from "./bee/b10-close";

/**
 * Bee, for colleagues who are not technical: the problem, what it does in a
 * meeting, privacy, and the ask. Light stage throughout; the route sets the
 * `bee` brand for honey accents and Bee's typeface.
 */
const SLIDES: DeckSlide[] = [
  { id: "bee-01-title", title: "Bee", Component: BeeTitle, steps: 0 },
  {
    id: "bee-02-problem",
    title: "The problem",
    Component: BeeProblem,
    steps: 2,
  },
  {
    id: "bee-03-notch",
    title: "Meet the notch",
    Component: BeeNotch,
    steps: 2,
  },
  {
    id: "bee-04-listens",
    title: "Listens, finds, tips",
    Component: BeeListens,
    steps: 3,
  },
  {
    id: "bee-05-web",
    title: "Answers from the web",
    Component: BeeWeb,
    steps: 2,
  },
  {
    id: "bee-11-real-meeting",
    title: "A real meeting",
    Component: BeeRealMeeting,
    steps: 3,
  },
  {
    id: "bee-06-summary",
    title: "The summary",
    Component: BeeSummary,
    steps: 3,
  },
  {
    id: "bee-07-teams",
    title: "Better together",
    Component: BeeTeams,
    steps: 2,
  },
  {
    id: "bee-08-private",
    title: "Private by design",
    Component: BeePrivate,
    steps: 2,
  },
  { id: "bee-09-tools", title: "Your tools", Component: BeeTools, steps: 2 },
  { id: "bee-10-close", title: "Try it", Component: BeeClose, steps: 0 },
];

export const BEE_SLIDES: DeckSlide[] = SLIDES.map(
  (slide): DeckSlide => ({ ...slide, theme: "light" }),
);
