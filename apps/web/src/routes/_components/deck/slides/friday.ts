import type { DeckSlide } from "./types";
import { Slide01Title } from "./01-title";
import { Slide02Numbers } from "./02-numbers";
import { Slide03Cloud } from "./03-cloud";
import { Slide04Sessions } from "./04-sessions";
import { Slide05SimpleMode } from "./05-simple-mode";
import { Slide06Automerge } from "./06-automerge";
import { Slide07Sandbox } from "./07-sandbox";
import { Slide08More } from "./08-more";
import { Slide10CodeReviews } from "./10-code-reviews";
import { Slide11WhatsNext } from "./11-whats-next";
import { Slide12Future } from "./12-future";
import { Slide13Developer } from "./13-developer";
import { Slide14Personal } from "./14-personal";
import { Slide15Closing } from "./15-closing";
import { FridayAsk } from "./friday/b01-ask";
import { FridayPreview } from "./friday/b02-preview";
import { FridayInbox } from "./friday/b03-inbox";
import { FridayDocuments } from "./friday/b04-documents";
import { FridayPlan } from "./friday/b05-plan";
import { FridayProjects } from "./friday/b06-projects";
import { FridayThreeWays } from "./friday/b07-three-ways";
import { FridayReviews } from "./friday/b08-reviews";
import { FridayAutomations } from "./friday/b09-automations";
import { FridayStandup } from "./friday/b10-standup";
import { FridaySkills } from "./friday/b11-skills";
import { FridayAve } from "./friday/b12-ave";
import { FridayReliability } from "./friday/b13-reliability";
import { FridayMobile } from "./friday/b14-mobile";
import { FridayArtifacts } from "./friday/b15-artifacts";
import { FridayClose } from "./friday/b16-close";

/**
 * Friday session deck order — the last three months, for a non-technical
 * audience. Five acts, each with its own kicker prefix: three months, using
 * Eva, on its own, trust and reach, and what's next; then the call to action.
 * The index here is the slide number minus one.
 */
export const FRIDAY_SLIDES: DeckSlide[] = [
  // ── Three months: the numbers, and where the work happens ───────────
  {
    id: "01-title",
    title: "Three months of Eva",
    Component: Slide01Title,
    steps: 0,
  },
  {
    id: "02-numbers",
    title: "The numbers",
    Component: Slide02Numbers,
    steps: 0,
  },
  {
    id: "03-cloud",
    title: "Nothing on a laptop",
    Component: Slide03Cloud,
    steps: 2,
  },
  {
    id: "07-sandbox",
    title: "Workspaces in under a second",
    Component: Slide07Sandbox,
    steps: 1,
  },

  // ── Using Eva: small asks up to large ones ──────────────────────────
  {
    id: "friday-b01-ask",
    title: "Say what you want",
    Component: FridayAsk,
    steps: 3,
  },
  {
    id: "friday-b02-preview",
    title: "See it first",
    Component: FridayPreview,
    steps: 2,
  },
  {
    id: "friday-b07-three-ways",
    title: "Three sizes of ask",
    Component: FridayThreeWays,
    steps: 3,
  },
  {
    id: "04-sessions",
    title: "Sessions grew up",
    Component: Slide04Sessions,
    steps: 3,
  },
  {
    id: "friday-b04-documents",
    title: "Documents",
    Component: FridayDocuments,
    steps: 2,
  },
  {
    id: "friday-b05-plan",
    title: "Ask for a plan",
    Component: FridayPlan,
    steps: 1,
  },
  {
    id: "friday-b06-projects",
    title: "Projects",
    Component: FridayProjects,
    steps: 2,
  },
  {
    id: "friday-b03-inbox",
    title: "The inbox",
    Component: FridayInbox,
    steps: 2,
  },
  {
    id: "05-simple-mode",
    title: "Simple Mode",
    Component: Slide05SimpleMode,
    steps: 1,
  },
  {
    id: "friday-b11-skills",
    title: "Skills",
    Component: FridaySkills,
    steps: 1,
  },

  // ── On its own: what runs without being asked ───────────────────────
  {
    id: "friday-b12-ave",
    title: "Manager Ave",
    Component: FridayAve,
    steps: 2,
  },
  {
    id: "06-automerge",
    title: "Auto-merge",
    Component: Slide06Automerge,
    steps: 2,
  },
  {
    id: "friday-b09-automations",
    title: "Automations",
    Component: FridayAutomations,
    steps: 2,
  },
  {
    id: "friday-b10-standup",
    title: "Daily standup",
    Component: FridayStandup,
    steps: 2,
  },

  // ── Trust and reach: when it breaks, and everywhere it goes ─────────
  {
    id: "friday-b13-reliability",
    title: "When it breaks",
    Component: FridayReliability,
    steps: 3,
  },
  {
    id: "friday-b14-mobile",
    title: "On your phone",
    Component: FridayMobile,
    steps: 1,
  },
  {
    id: "friday-b15-artifacts",
    title: "Artifacts",
    Component: FridayArtifacts,
    steps: 2,
  },
  { id: "08-more", title: "And more", Component: Slide08More, steps: 0 },
  {
    id: "friday-b08-reviews",
    title: "Reviewing",
    Component: FridayReviews,
    steps: 2,
  },

  // ── What's next: the queue, and where this is heading ───────────────
  {
    id: "11-whats-next",
    title: "The bottleneck",
    Component: Slide11WhatsNext,
    steps: 2,
  },
  {
    id: "10-code-reviews",
    title: "Code reviews",
    Component: Slide10CodeReviews,
    steps: 3,
  },
  {
    id: "12-future",
    title: "Where this is heading",
    Component: Slide12Future,
    steps: 3,
  },
  {
    id: "13-developer",
    title: "Role of the developer",
    Component: Slide13Developer,
    steps: 3,
  },
  {
    id: "14-personal",
    title: "Eva and the rest",
    Component: Slide14Personal,
    steps: 3,
  },

  // ── Call to action and close ────────────────────────────────────────
  {
    id: "friday-b16-close",
    title: "On Monday",
    Component: FridayClose,
    steps: 3,
  },
  {
    id: "15-closing",
    title: "Built in Eva, by Eva",
    Component: Slide15Closing,
    steps: 0,
  },
];
