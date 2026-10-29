import type { DeckSlide } from "./types";
import { BeeBlank } from "./bee/b00-blank";
import { BeeTitle } from "./bee/b01-title";
import { BeeProblem } from "./bee/b02-problem";
import { BeeBackground } from "./bee/b12-background";
import { BeeNotch } from "./bee/b03-notch";
import { BeeListens } from "./bee/b04-listens";
import { BeeWeb } from "./bee/b05-web";
import { BeeRealMeeting } from "./bee/b11-real-meeting";
import { BeeSummary } from "./bee/b06-summary";
import { BeeTeams } from "./bee/b07-teams";
import { BeePrivate } from "./bee/b08-private";
import { BeeCost } from "./bee/b13-cost";
import { BeeCompare } from "./bee/b14-compare";
import { BeeTools } from "./bee/b09-tools";
import { BeeClose } from "./bee/b10-close";
import { DraftProblemClock } from "./bee/drafts/d02-problem-clock";

/**
 * Bee, for colleagues who are not technical: the problem, what it does in a
 * meeting, privacy, and the ask. Light stage throughout; the route sets the
 * `bee` brand for honey accents and Bee's typeface.
 */
const SLIDES: DeckSlide[] = [
  {
    id: "bee-00-blank",
    title: "Blank",
    Component: BeeBlank,
    steps: 0,
    blank: true,
  },
  {
    id: "bee-01-title",
    title: "Bee",
    Component: BeeTitle,
    steps: 2,
    // The flight lands at about 3 s; then the name, then the line under it.
    autoMs: [3100, 1400],
  },
  {
    id: "bee-02-problem",
    title: "The problem",
    Component: BeeProblem,
    steps: 2,
  },
  // Draft for review: keep, merge into the slide above, or delete.
  {
    id: "bee-draft-problem",
    title: "Draft: problem, the clock",
    Component: DraftProblemClock,
    steps: 2,
    autoMs: [1100, 4500],
  },
  {
    id: "bee-03-notch",
    title: "Meet the notch",
    Component: BeeNotch,
    steps: 2,
    // A moment on the wide call before the zoom, then time to watch it listen.
    autoMs: [2800, 3200],
  },
  {
    id: "bee-04-listens",
    title: "Listens, finds, tips",
    Component: BeeListens,
    steps: 3,
    autoMs: [1100, 2200, 2200],
  },
  {
    id: "bee-05-web",
    title: "Answers from the web",
    Component: BeeWeb,
    // Three questions: each is heard and searched, then its sources show.
    steps: 6,
    autoMs: [1100, 2800, 2600, 2800, 2600, 2800],
  },
  {
    id: "bee-11-real-meeting",
    title: "A real meeting",
    Component: BeeRealMeeting,
    steps: 3,
    // Each round types four searches (about 10.7 s) before moving on.
    autoMs: [1100, 11400, 11400],
  },
  {
    id: "bee-06-summary",
    title: "The summary",
    Component: BeeSummary,
    steps: 5,
    autoMs: [3000, 1800, 1500, 1800, 1800],
  },
  {
    id: "bee-07-teams",
    title: "Better together",
    Component: BeeTeams,
    steps: 7,
    // Six lines of conversation, each typed out before the next voice, then the point.
    autoMs: [1300, 2200, 2200, 2200, 2200, 2200, 2200],
  },
  {
    id: "bee-14-compare",
    title: "Teams and Bee",
    Component: BeeCompare,
    steps: 3,
  },
  {
    id: "bee-08-private",
    title: "Private by design",
    Component: BeePrivate,
    steps: 2,
  },
  {
    id: "bee-13-cost",
    title: "Already paid for",
    Component: BeeCost,
    steps: 2,
    autoMs: [1100, 3000],
  },
  { id: "bee-09-tools", title: "Your tools", Component: BeeTools, steps: 2 },
  {
    id: "bee-12-background",
    title: "Works in the background",
    Component: BeeBackground,
    steps: 4,
  },
  {
    id: "bee-10-close",
    title: "Try it",
    Component: BeeClose,
    steps: 4,
    autoMs: [1600, 1700, 1800, 1400],
  },
];

export const BEE_SLIDES: DeckSlide[] = SLIDES.map(
  (slide): DeckSlide => ({ ...slide, theme: "light" }),
);
