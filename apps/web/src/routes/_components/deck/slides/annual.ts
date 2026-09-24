import type { DeckSlide } from "./types";
import { AnnualTitle } from "./annual/a01-title";
import { AnnualOrigin } from "./annual/a02-origin";
import { AnnualNumbers } from "./annual/a03-numbers";
import { AnnualAdoption } from "./annual/a04-adoption";
import { Slide09Team } from "./09-team";
import { AnnualImpact } from "./annual/a06-impact";
import { AnnualHow } from "./annual/a07-how";
import { AnnualDesign } from "./annual/a09-design";
import { AnnualDebugging } from "./annual/a10-debugging";
import { AnnualCraft } from "./annual/a11-craft";
import { AnnualQuality } from "./annual/a12-quality";
import { AnnualPeople } from "./annual/a13-people";
import { AnnualUsers } from "./annual/a14-users";
import { AnnualAhead } from "./annual/a08-ahead";
import { AnnualFramework } from "./annual/a15-framework";
import { Slide15Closing } from "./15-closing";
import { AnnualDayOne } from "./annual/b01-day-one";
import { AnnualFirstWeek } from "./annual/b02-first-week";
import { AnnualQ1 } from "./annual/b03-q1";
import { AnnualLoad } from "./annual/b04-load";
import { AnnualQ2 } from "./annual/b05-q2";
import { AnnualQ3 } from "./annual/b06-q3";
import { AnnualVolume } from "./annual/b07-volume";
import { AnnualRename } from "./annual/b08-rename";
import { AnnualProviders } from "./annual/c01-providers";
import { AnnualSdks } from "./annual/c02-sdks";
import { AnnualHandoff } from "./annual/c03-handoff";
import { AnnualAccounts } from "./annual/c04-accounts";
import { AnnualMcp } from "./annual/c05-mcp";
import { AnnualMcpSecurity } from "./annual/c06-mcp-security";
import { AnnualSandboxEconomics } from "./annual/c07-sandbox-economics";
import { AnnualOcc } from "./annual/c08-occ";
import { AnnualSecurity } from "./annual/d01-security";
import { AnnualDesignSystem } from "./annual/d02-design-system";
import { AnnualMotion } from "./annual/d03-motion";
import { AnnualFrontendPerf } from "./annual/d04-frontend-perf";
import { AnnualScale } from "./annual/d05-scale";
import { AnnualAbandoned } from "./annual/d06-abandoned";
import { AnnualLessons } from "./annual/d07-lessons";
import { AnnualDurable } from "./annual/d08-durable";

/**
 * Annual CDM deck order — Eva's whole life and its impact. Five movements:
 * the origin story, who used it and what it changed, how the platform is
 * built, the craft behind it, then the framework it is all evidence for.
 * The index here is the slide number minus one.
 */
export const ANNUAL_SLIDES: DeckSlide[] = [
  // ── Movement one: the origin story ──────────────────────────────────
  { id: "a01-title", title: "Title", Component: AnnualTitle, steps: 0 },
  {
    id: "annual-b01-day-one",
    title: "Day one",
    Component: AnnualDayOne,
    steps: 2,
  },
  {
    id: "annual-b02-first-week",
    title: "Week one",
    Component: AnnualFirstWeek,
    steps: 2,
  },
  { id: "annual-b03-q1", title: "Chapter one", Component: AnnualQ1, steps: 3 },
  {
    id: "annual-b04-load",
    title: "Make it load",
    Component: AnnualLoad,
    steps: 2,
  },
  { id: "annual-b05-q2", title: "Chapter two", Component: AnnualQ2, steps: 3 },
  {
    id: "annual-b06-q3",
    title: "Chapter three",
    Component: AnnualQ3,
    steps: 3,
  },
  {
    id: "annual-b08-rename",
    title: "Not always Eva",
    Component: AnnualRename,
    steps: 2,
  },
  {
    id: "a02-origin",
    title: "Where it started",
    Component: AnnualOrigin,
    steps: 3,
  },
  {
    id: "annual-b07-volume",
    title: "Shape of the year",
    Component: AnnualVolume,
    steps: 2,
  },

  // ── Movement two: who used it, and what it changed ──────────────────
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

  // ── Movement three: how the platform is built ───────────────────────
  {
    id: "annual-c01-providers",
    title: "Not one supplier",
    Component: AnnualProviders,
    steps: 2,
  },
  {
    id: "annual-c02-sdks",
    title: "Proper connections",
    Component: AnnualSdks,
    steps: 2,
  },
  {
    id: "annual-c03-handoff",
    title: "Change your mind",
    Component: AnnualHandoff,
    steps: 1,
  },
  {
    id: "annual-c04-accounts",
    title: "Bring your own account",
    Component: AnnualAccounts,
    steps: 2,
  },
  {
    id: "annual-c05-mcp",
    title: "A control panel",
    Component: AnnualMcp,
    steps: 3,
  },
  {
    id: "annual-c06-mcp-security",
    title: "Locked down",
    Component: AnnualMcpSecurity,
    steps: 2,
  },
  {
    id: "annual-c07-sandbox-economics",
    title: "What a workspace costs",
    Component: AnnualSandboxEconomics,
    steps: 3,
  },

  // ── Movement four: the craft behind it ──────────────────────────────
  { id: "a09-design", title: "Design", Component: AnnualDesign, steps: 3 },
  {
    id: "annual-c08-occ",
    title: "Fighting itself",
    Component: AnnualOcc,
    steps: 3,
  },
  {
    id: "a10-debugging",
    title: "Debugging",
    Component: AnnualDebugging,
    steps: 3,
  },
  {
    id: "annual-d08-durable",
    title: "Finishing what it starts",
    Component: AnnualDurable,
    steps: 2,
  },
  {
    id: "annual-d01-security",
    title: "Locking the doors",
    Component: AnnualSecurity,
    steps: 3,
  },
  { id: "a11-craft", title: "Beyond code", Component: AnnualCraft, steps: 2 },
  {
    id: "annual-d04-frontend-perf",
    title: "Quick to open",
    Component: AnnualFrontendPerf,
    steps: 3,
  },
  {
    id: "annual-d02-design-system",
    title: "One visual language",
    Component: AnnualDesignSystem,
    steps: 2,
  },
  {
    id: "annual-d03-motion",
    title: "How it moves",
    Component: AnnualMotion,
    steps: 2,
  },
  { id: "a12-quality", title: "Quality", Component: AnnualQuality, steps: 2 },
  {
    id: "annual-d05-scale",
    title: "How big it is",
    Component: AnnualScale,
    steps: 2,
  },
  {
    id: "annual-d06-abandoned",
    title: "Things we stopped",
    Component: AnnualAbandoned,
    steps: 3,
  },

  // ── Movement five: the people, the lessons, the framework ───────────
  {
    id: "a13-people",
    title: "Working with others",
    Component: AnnualPeople,
    steps: 3,
  },
  {
    id: "annual-d07-lessons",
    title: "What we learned",
    Component: AnnualLessons,
    steps: 2,
  },
  {
    id: "a14-users",
    title: "The people using it",
    Component: AnnualUsers,
    steps: 2,
  },
  {
    id: "a08-ahead",
    title: "The year ahead",
    Component: AnnualAhead,
    steps: 2,
  },
  {
    id: "a15-framework",
    title: "Against the framework",
    Component: AnnualFramework,
    steps: 3,
  },
  { id: "15-closing", title: "Closing", Component: Slide15Closing, steps: 0 },
];
