import type { ComponentType } from "react";
import type { LandingPreviewKey } from "../landingContent";
import type { LandingDemoProps } from "./LandingStage";
import { AgentsDemo } from "./AgentsDemo";
import { ArenaDemo } from "./ArenaDemo";
import { AutomationsDemo } from "./AutomationsDemo";
import { DocumentsDemo } from "./DocumentsDemo";
import { DraftsDemo } from "./DraftsDemo";
import { InboxDemo } from "./InboxDemo";
import { ProjectsDemo } from "./ProjectsDemo";
import { QuickTasksDemo } from "./QuickTasksDemo";
import { ReviewsDemo } from "./ReviewsDemo";
import { SessionsDemo } from "./SessionsDemo";
import { SkillsDemo } from "./SkillsDemo";
import { SnapshotsDemo } from "./SnapshotsDemo";
import { StatsDemo } from "./StatsDemo";
import { TeamsDemo } from "./TeamsDemo";

export interface LandingDemo {
  Demo: ComponentType<LandingDemoProps>;
  /** How long the story runs before it calls `onEnd`; the tab underline fills over it. */
  seconds: number;
}

/**
 * Every feature's demo, keyed by the closed `LandingPreviewKey` union. An
 * exhaustive record means a new feature cannot ship with an empty panel — the
 * missing key is a type error here.
 */
export const LANDING_PREVIEWS: Record<LandingPreviewKey, LandingDemo> = {
  documents: { Demo: DocumentsDemo, seconds: 12 },
  projects: { Demo: ProjectsDemo, seconds: 12 },
  drafts: { Demo: DraftsDemo, seconds: 12 },
  sessions: { Demo: SessionsDemo, seconds: 10.5 },
  quickTasks: { Demo: QuickTasksDemo, seconds: 12 },
  agents: { Demo: AgentsDemo, seconds: 12 },
  reviews: { Demo: ReviewsDemo, seconds: 12 },
  arena: { Demo: ArenaDemo, seconds: 12 },
  automations: { Demo: AutomationsDemo, seconds: 12 },
  snapshots: { Demo: SnapshotsDemo, seconds: 12 },
  skills: { Demo: SkillsDemo, seconds: 12 },
  stats: { Demo: StatsDemo, seconds: 12 },
  inbox: { Demo: InboxDemo, seconds: 12 },
  teams: { Demo: TeamsDemo, seconds: 12 },
};
