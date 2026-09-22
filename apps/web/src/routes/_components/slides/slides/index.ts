import type { ComponentType } from "react";
import { Slide00Black } from "./00-black";
import { Slide01Title } from "./01-title";
import { Slide02Gap } from "./02-gap";
import { Slide03QuickTasks } from "./03-quick-tasks";
import { Slide04Sessions } from "./04-sessions";
import { Slide05Projects } from "./05-projects";
import { Slide06Documents } from "./06-documents";
import { Slide07PRs } from "./07-prs";
import { Slide08Stack } from "./08-stack";
import { Slide09GitHub } from "./09-github";
import { Slide10Sandboxes } from "./10-sandboxes";
import { Slide11Insight } from "./11-insight";
import { Slide12Demo } from "./12-demo";
import { Slide13Closing } from "./13-closing";

export interface SlideEntry {
  id: string;
  title: string;
  theme: "dark" | "light";
  Component: ComponentType;
  steps: number;
  staggerMs?: number;
}

export const SLIDES: SlideEntry[] = [
  // ── Act 1 · Open (dark) ──────────────────────────────────────────────
  {
    id: "00",
    title: "Start",
    theme: "dark",
    Component: Slide00Black,
    steps: 0,
  },
  {
    id: "01",
    title: "Title",
    theme: "dark",
    Component: Slide01Title,
    steps: 0,
  },

  // ── Act 2 · The problem + features (light) ───────────────────────────
  {
    id: "02",
    title: "The gap",
    theme: "light",
    Component: Slide02Gap,
    steps: 0,
  },
  {
    id: "03",
    title: "Quick tasks",
    theme: "light",
    Component: Slide03QuickTasks,
    steps: 0,
  },
  {
    id: "04",
    title: "Sessions",
    theme: "light",
    Component: Slide04Sessions,
    steps: 0,
  },
  {
    id: "05",
    title: "Projects",
    theme: "light",
    Component: Slide05Projects,
    steps: 0,
  },
  {
    id: "06",
    title: "Documents",
    theme: "light",
    Component: Slide06Documents,
    steps: 0,
  },
  {
    id: "07",
    title: "GitHub flow",
    theme: "light",
    Component: Slide07PRs,
    steps: 0,
  },

  // ── Act 3 · Tech + how it works (light) ──────────────────────────────
  {
    id: "08",
    title: "Tech stack",
    theme: "light",
    Component: Slide08Stack,
    steps: 0,
  },
  {
    id: "09",
    title: "GitHub integration",
    theme: "light",
    Component: Slide09GitHub,
    steps: 0,
  },
  {
    id: "10",
    title: "Sandboxes",
    theme: "light",
    Component: Slide10Sandboxes,
    steps: 0,
  },

  // ── Act 4 · Key insight + demo + close (dark) ────────────────────────
  {
    id: "11",
    title: "Key insight",
    theme: "dark",
    Component: Slide11Insight,
    steps: 0,
  },
  {
    id: "12",
    title: "Demo",
    theme: "dark",
    Component: Slide12Demo,
    steps: 0,
  },
  {
    id: "13",
    title: "Closing",
    theme: "dark",
    Component: Slide13Closing,
    steps: 0,
  },
];
