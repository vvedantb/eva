import type { DeckSlide } from "./types";
import { IntroTitle } from "./intro/01-title";
import { IntroGap } from "./intro/02-gap";
import { IntroQuickTasks } from "./intro/03-quick-tasks";
import { IntroSessions } from "./intro/04-sessions";
import { IntroProjects } from "./intro/05-projects";
import { IntroDocuments } from "./intro/06-documents";
import { IntroPrs } from "./intro/07-prs";
import { IntroStack } from "./intro/08-stack";
import { IntroGitHub } from "./intro/09-github";
import { IntroSandboxes } from "./intro/10-sandboxes";
import { IntroInsight } from "./intro/11-insight";
import { IntroDemo } from "./intro/12-demo";
import { IntroClosing } from "./intro/13-closing";

/**
 * Intro to Eva deck order. Four acts: the open, the problem and the features,
 * the technology, then the insight, the demo and the close. The ids keep the
 * numbering of the deck this was ported from, prefixed so the speaker notes
 * cannot collide with the other two decks.
 */
export const INTRO_SLIDES: DeckSlide[] = [
  // Act 1 · Open
  {
    id: "intro-01-title",
    title: "Title",
    theme: "dark",
    Component: IntroTitle,
    steps: 0,
  },

  // Act 2 · The problem, and the features
  {
    id: "intro-02-gap",
    title: "The gap",
    theme: "light",
    Component: IntroGap,
    steps: 0,
  },
  {
    id: "intro-03-quick-tasks",
    title: "Quick tasks",
    theme: "light",
    Component: IntroQuickTasks,
    steps: 0,
  },
  {
    id: "intro-04-sessions",
    title: "Sessions",
    theme: "light",
    Component: IntroSessions,
    steps: 0,
  },
  {
    id: "intro-05-projects",
    title: "Projects",
    theme: "light",
    Component: IntroProjects,
    steps: 0,
  },
  {
    id: "intro-06-documents",
    title: "Documents",
    theme: "light",
    Component: IntroDocuments,
    steps: 0,
  },
  {
    id: "intro-07-prs",
    title: "GitHub flow",
    theme: "light",
    Component: IntroPrs,
    steps: 0,
  },

  // Act 3 · How it is built
  {
    id: "intro-08-stack",
    title: "Tech stack",
    theme: "light",
    Component: IntroStack,
    steps: 0,
  },
  {
    id: "intro-09-github",
    title: "GitHub integration",
    theme: "light",
    Component: IntroGitHub,
    steps: 0,
  },
  {
    id: "intro-10-sandboxes",
    title: "Sandboxes",
    theme: "light",
    Component: IntroSandboxes,
    steps: 0,
  },

  // Act 4 · The insight, the demo and the close
  {
    id: "intro-11-insight",
    title: "Key insight",
    theme: "dark",
    Component: IntroInsight,
    steps: 0,
  },
  {
    id: "intro-12-demo",
    title: "Demo",
    theme: "dark",
    Component: IntroDemo,
    steps: 0,
  },
  {
    id: "intro-13-closing",
    title: "Closing",
    theme: "dark",
    Component: IntroClosing,
    steps: 0,
  },
];
