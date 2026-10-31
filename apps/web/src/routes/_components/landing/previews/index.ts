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
  documents: { Demo: DocumentsDemo, seconds: 9.9 },
  projects: { Demo: ProjectsDemo, seconds: 9.6 },
  drafts: { Demo: DraftsDemo, seconds: 9.7 },
  sessions: { Demo: SessionsDemo, seconds: 10.5 },
  quickTasks: { Demo: QuickTasksDemo, seconds: 9.8 },
  agents: { Demo: AgentsDemo, seconds: 9.1 },
  reviews: { Demo: ReviewsDemo, seconds: 9.2 },
  arena: { Demo: ArenaDemo, seconds: 10.6 },
  automations: { Demo: AutomationsDemo, seconds: 9.3 },
  snapshots: { Demo: SnapshotsDemo, seconds: 8.7 },
  skills: { Demo: SkillsDemo, seconds: 8.4 },
  stats: { Demo: StatsDemo, seconds: 9.3 },
  inbox: { Demo: InboxDemo, seconds: 8.4 },
  teams: { Demo: TeamsDemo, seconds: 8.8 },
};
