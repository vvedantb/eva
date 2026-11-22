import type { DeckSlide } from "./types";
import { AnnualParked } from "./annual/g01-parked";
import { AnnualChecks } from "./annual/g02-checks";
import { AnnualSkills } from "./annual/g03-skills";
import { AnnualFeedback } from "./annual/g04-feedback";
import { AnnualPatchPackages } from "./annual/e03-patch-packages";
import { AnnualCarePulse } from "./annual/e02-carepulse";
import {
  SectionBee,
  SectionCarePulse,
  SectionEva,
  SectionFlowtape,
  SectionRedline,
  SectionVmem,
} from "./annual/f01-sections";
import {
  ProjectBee,
  ProjectFlowtape,
  ProjectRedline,
  ProjectVmem,
} from "./annual/f02-projects";
import { Slide05SimpleMode } from "./05-simple-mode";
import { Slide07Sandbox } from "./07-sandbox";
import { FridayPipeline } from "./friday/b19-pipeline";
import { FridayJevWhat } from "./friday/b20-jev-what";
import { FridayJevCarePulse } from "./friday/b21-jev-carepulse";
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
import { AnnualQ2 } from "./annual/b05-q2";
import { AnnualQ3 } from "./annual/b06-q3";
import { AnnualProviders } from "./annual/c01-providers";
import { AnnualHandoff } from "./annual/c03-handoff";
import { AnnualAccounts } from "./annual/c04-accounts";
import { AnnualMcp } from "./annual/c05-mcp";
import { AnnualMcpSecurity } from "./annual/c06-mcp-security";
import { AnnualSandboxEconomics } from "./annual/c07-sandbox-economics";
import { AnnualOcc } from "./annual/c08-occ";
import { AnnualSecurity } from "./annual/d01-security";
import { AnnualDesignSystem } from "./annual/d02-design-system";
import { AnnualFrontendPerf } from "./annual/d04-frontend-perf";
import { AnnualScale } from "./annual/d05-scale";
import { AnnualAbandoned } from "./annual/d06-abandoned";
import { AnnualLessons } from "./annual/d07-lessons";
import { AnnualDurable } from "./annual/d08-durable";

import { Slide04Sessions } from "./04-sessions";
import { FridayReliability } from "./friday/b13-reliability";
import { FridayLimits } from "./friday/b18-limits";
/**
 * Annual CDM deck order, in sections: Eva, CarePulse, then the side projects
 * (vmem, flowtape, Redline, Bee), each opened by its own slide and painted in
 * its own colours (`section`). The framework map and the last word close it.
 * The index here is the slide number minus one.
 */
export const ANNUAL_SLIDES: DeckSlide[] = [
  {
    id: "a01-title",
    title: "Annual CDM",
    Component: AnnualTitle,
    steps: 0,
  },
  // ── Eva: the main project ──
  {
    id: "annual-s01-eva",
    title: "Eva",
    Component: SectionEva,
    steps: 0,
  },
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
  {
    id: "annual-b05-q2",
    title: "Chapter two: work together",
    Component: AnnualQ2,
    steps: 3,
  },
  {
    id: "annual-b06-q3",
    title: "Chapter three: make it dependable",
    Component: AnnualQ3,
    steps: 3,
  },
  {
    id: "04-sessions",
    title: "Sessions grew up",
    Component: Slide04Sessions,
    steps: 3,
  },
  {
    id: "a02-origin",
    title: "The story so far",
    Component: AnnualOrigin,
    steps: 3,
  },
  {
    id: "a03-numbers",
    title: "What the year has produced",
    Component: AnnualNumbers,
    steps: 1,
  },
  {
    id: "a04-adoption",
    title: "How it took hold",
    Component: AnnualAdoption,
    steps: 1,
  },
  {
    id: "09-team",
    title: "Built by the team",
    Component: Slide09Team,
    steps: 6,
  },
  {
    id: "a06-impact",
    title: "What it changed",
    Component: AnnualImpact,
    steps: 3,
  },
  { id: "a07-how", title: "How it works", Component: AnnualHow, steps: 2 },
  {
    id: "annual-c01-providers",
    title: "Not tied to one supplier",
    Component: AnnualProviders,
    steps: 2,
  },
  {
    id: "annual-c03-handoff",
    title: "Change your mind mid-job",
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
    title: "Other tools can drive Eva",
    Component: AnnualMcp,
    steps: 3,
  },
  {
    id: "annual-c06-mcp-security",
    title: "Locked down by design",
    Component: AnnualMcpSecurity,
    steps: 2,
  },
  {
    id: "07-sandbox",
    title: "Workspaces in under a second",
    Component: Slide07Sandbox,
    steps: 1,
  },
  {
    id: "annual-c07-sandbox-economics",
    title: "Workspaces clean up",
    Component: AnnualSandboxEconomics,
    steps: 3,
  },
  {
    id: "a09-design",
    title: "Decided on paper first",
    Component: AnnualDesign,
    steps: 3,
  },
  {
    id: "a10-debugging",
    title: "Symptom, cause, then a test",
    Component: AnnualDebugging,
    steps: 3,
  },
  {
    id: "annual-c08-occ",
    title: "The database was fighting itself",
    Component: AnnualOcc,
    steps: 3,
  },
  {
    id: "annual-d08-durable",
    title: "Finishing what it starts",
    Component: AnnualDurable,
    steps: 2,
  },
  {
    id: "friday-b13-reliability",
    title: "When it breaks",
    Component: FridayReliability,
    steps: 3,
  },
  {
    id: "annual-d01-security",
    title: "One guard on every door",
    Component: AnnualSecurity,
    steps: 3,
  },
  {
    id: "a11-craft",
    title: "Measure it, do not guess",
    Component: AnnualCraft,
    steps: 2,
  },
  {
    id: "annual-d04-frontend-perf",
    title: "Three waits, measured and cut",
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
    id: "a12-quality",
    title: "The bar is enforced",
    Component: AnnualQuality,
    steps: 2,
  },
  {
    id: "annual-d05-scale",
    title: "A product, not a prototype",
    Component: AnnualScale,
    steps: 2,
  },
  {
    id: "annual-d06-abandoned",
    title: "Knowing what to stop",
    Component: AnnualAbandoned,
    steps: 3,
  },
  {
    id: "a13-people",
    title: "Their problems set the agenda",
    Component: AnnualPeople,
    steps: 3,
  },
  {
    id: "a14-users",
    title: "Built for who uses it",
    Component: AnnualUsers,
    steps: 2,
  },
  {
    id: "05-simple-mode",
    title: "Simple Mode",
    Component: Slide05SimpleMode,
    steps: 1,
  },
  {
    id: "annual-g02-checks",
    title: "Ready, at a glance",
    Component: AnnualChecks,
    steps: 2,
  },
  {
    id: "friday-b18-limits",
    title: "Same problems",
    Component: FridayLimits,
    steps: 3,
  },
  {
    id: "annual-d07-lessons",
    title: "Two lessons, one direction",
    Component: AnnualLessons,
    steps: 2,
  },
  {
    id: "annual-e03-patch-packages",
    title: "Patch the package",
    Component: AnnualPatchPackages,
    steps: 3,
  },
  {
    id: "annual-g01-parked",
    title: "Built, then parked",
    Component: AnnualParked,
    steps: 3,
  },
  {
    id: "friday-b19-pipeline",
    title: "Code review to live",
    Component: FridayPipeline,
    steps: 3,
  },
  {
    id: "annual-g04-feedback",
    title: "Every chat teaches Eva",
    Component: AnnualFeedback,
    steps: 3,
  },
  {
    id: "a08-ahead",
    title: "The bottleneck has moved",
    Component: AnnualAhead,
    steps: 2,
  },
  // ── CarePulse: the day job, in CarePulse blue on the light stage ──
  {
    id: "annual-s02-carepulse",
    title: "CarePulse",
    Component: SectionCarePulse,
    steps: 0,
    theme: "light",
    section: "carepulse",
  },
  {
    id: "annual-e02-carepulse",
    title: "CarePulse this year",
    Component: AnnualCarePulse,
    steps: 4,
    theme: "light",
    section: "carepulse",
  },
  {
    id: "annual-g03-skills",
    title: "Teaching the agent our codebase",
    Component: AnnualSkills,
    steps: 3,
    theme: "light",
    section: "carepulse",
  },
  {
    id: "friday-b20-jev-what",
    title: "What Jev is",
    Component: FridayJevWhat,
    steps: 4,
    theme: "light",
    section: "carepulse",
  },
  {
    id: "friday-b21-jev-carepulse",
    title: "Jev inside CarePulse",
    Component: FridayJevCarePulse,
    steps: 2,
    theme: "light",
    section: "carepulse",
  },
  // ── Side projects: one opener and one recap each, in their own colours ──
  {
    id: "annual-s03-vmem",
    title: "vmem",
    Component: SectionVmem,
    steps: 0,
    section: "vmem",
  },
  {
    id: "annual-f01-vmem",
    title: "vmem: one memory for every AI",
    Component: ProjectVmem,
    steps: 2,
    section: "vmem",
  },
  {
    id: "annual-s04-flowtape",
    title: "flowtape",
    Component: SectionFlowtape,
    steps: 0,
    section: "flowtape",
  },
  {
    id: "annual-f02-flowtape",
    title: "flowtape: click through, get a test",
    Component: ProjectFlowtape,
    steps: 2,
    section: "flowtape",
  },
  {
    id: "annual-s05-redline",
    title: "Redline",
    Component: SectionRedline,
    steps: 0,
    section: "redline",
  },
  {
    id: "annual-f03-redline",
    title: "Redline: every page, before and after",
    Component: ProjectRedline,
    steps: 2,
    section: "redline",
  },
  {
    id: "annual-s06-bee",
    title: "Bee",
    Component: SectionBee,
    steps: 0,
    section: "bee",
  },
  {
    id: "annual-f04-bee",
    title: "Bee: answers during the meeting",
    Component: ProjectBee,
    steps: 2,
    section: "bee",
  },
  // ── Close: the framework map and the last word, back in Eva colours ──
  {
    id: "a15-framework",
    title: "Senior engineer, mapped",
    Component: AnnualFramework,
    steps: 1,
  },
  {
    id: "15-closing",
    title: "Built in Eva, by Eva",
    Component: Slide15Closing,
    steps: 0,
  },
];
