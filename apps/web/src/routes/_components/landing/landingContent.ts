import type { ComponentType } from "react";
import {
  IconBrowser,
  IconLayoutDashboard,
  IconPlug,
  IconRobot,
  IconSparkles,
  IconStack2,
  IconUsers,
} from "@tabler/icons-react";
import {
  AutomationsIcon,
  DocumentsIcon,
  DraftsIcon,
  InboxIcon,
  ProjectsIcon,
  QuickTasksIcon,
  ReviewsIcon,
  SessionsIcon,
  StatsIcon,
  TestingArenaIcon,
} from "@/lib/components/sidebar/icons/AnimatedNavIcons";
import type { BrandName } from "./BrandMark";

/**
 * Every string on the marketing page lives here so copy can be reviewed in one
 * file rather than hunted across a dozen components. Only features that ship in
 * production are listed — `Designs` is `devOnly` in the repo nav and is
 * deliberately absent.
 */

export const EVA_GITHUB_URL = "https://github.com/vvedantb/eva";
export const EVA_SETUP_URL = `${EVA_GITHUB_URL}#self-hosting`;

/**
 * Identifies the mock panel a feature shows in its pillar showcase. The union is
 * closed so `LANDING_PREVIEWS` can be an exhaustive record — adding a feature
 * without a preview is then a type error rather than a blank panel.
 */
export type LandingPreviewKey =
  | "documents"
  | "projects"
  | "drafts"
  | "sessions"
  | "quickTasks"
  | "agents"
  | "reviews"
  | "arena"
  | "automations"
  | "snapshots"
  | "skills"
  | "stats"
  | "inbox"
  | "teams";

/**
 * Icon shape a feature tab can render. Deliberately narrower than either source
 * it accepts: the animated sidebar icons take `size` and `className` and
 * nothing else, and Tabler's icons take a superset, so this is the widest type
 * both satisfy. Features that exist in the product nav reuse that exact icon so
 * the marketing page and the app agree; the rest fall back to Tabler.
 */
type LandingIcon = ComponentType<{
  size?: number;
  className?: string;
}>;

export interface LandingFeature {
  icon: LandingIcon;
  name: string;
  summary: string;
  points: readonly string[];
  preview: LandingPreviewKey;
}

export interface LandingPillar {
  /** Anchor target for the nav and for deep links. */
  id: string;
  step: string;
  /** Short name used by the workflow strip and the section eyebrow. */
  label: string;
  /** One line describing the stage, shown in the workflow strip. */
  tagline: string;
  heading: string;
  intro: string;
  features: readonly LandingFeature[];
}

export const LANDING_NAV_LINKS = [
  { label: "Features", href: "#plan" },
  { label: "Sandbox", href: "#sandbox" },
  { label: "MCP", href: "#mcp" },
  { label: "Open source", href: "#open-source" },
] as const;

/** Verbs an agent can actually perform in a sandbox — shown under the hero. */
export const LANDING_HERO_CAPABILITIES = [
  "run shell commands",
  "install dependencies",
  "execute tests",
  "build and preview",
  "drive a browser",
  "open pull requests",
] as const;

export const LANDING_PILLARS: readonly LandingPillar[] = [
  {
    id: "plan",
    step: "01",
    label: "Plan",
    tagline: "Specs, projects and ideas next to the code.",
    heading: "Give the agent something to work from.",
    intro:
      "Requirements, structure and half-formed ideas live beside the repository, so a task starts with context instead of a prompt.",
    features: [
      {
        icon: DocumentsIcon,
        name: "Documents",
        summary: "PRDs and specs the agent reads.",
        points: [
          "Real-time collaborative editor",
          "Pulled into agent context during a task",
          "Kept beside the repository, not in another tool",
        ],
        preview: "documents",
      },
      {
        icon: ProjectsIcon,
        name: "Projects",
        summary: "Multi-task work with a build pipeline.",
        points: [
          "Kanban, timeline and list views",
          "Split a feature into tasks that run on their own",
          "Follow the whole thing through to merge",
        ],
        preview: "projects",
      },
      {
        icon: DraftsIcon,
        name: "Drafts",
        summary: "Somewhere to put an idea.",
        points: [
          "Capture work before it is specified",
          "Promote a draft into a task when it is ready",
          "Per repository, kept out of the backlog",
        ],
        preview: "drafts",
      },
    ],
  },
  {
    id: "build",
    step: "02",
    label: "Build",
    tagline: "Pair live, or run a dozen changes at once.",
    heading: "Two ways to run an agent.",
    intro:
      "Sit with one in a live environment, or fire off a batch of small changes and come back when they are done.",
    features: [
      {
        icon: SessionsIcon,
        name: "Sessions",
        summary: "Pair programming in a live sandbox.",
        points: [
          "Preview, terminal, file tree and editor beside the chat",
          "PR diffs without leaving the page",
          "An agent-controlled browser you can watch",
        ],
        preview: "sessions",
      },
      {
        icon: QuickTasksIcon,
        name: "Quick Tasks",
        summary: "Small changes, many at once.",
        points: [
          "Self-contained tasks that run in parallel",
          "Kanban and list views, filters and bulk actions",
          "Each one gets its own sandbox and branch",
        ],
        preview: "quickTasks",
      },
      {
        icon: IconRobot,
        name: "Any agent",
        summary: "Claude Code, Codex, opencode, Cursor.",
        points: [
          "All four CLIs preinstalled in every sandbox",
          "Choose per task rather than per platform",
          "Credentials come from your own environment variables",
        ],
        preview: "agents",
      },
    ],
  },
  {
    id: "verify",
    step: "03",
    label: "Verify",
    tagline: "A diff and a recap for every change.",
    heading: "Review before merge.",
    intro:
      "Every change arrives with a diff, a written recap, and whatever checks you have configured.",
    features: [
      {
        icon: ReviewsIcon,
        name: "Reviews",
        summary: "Every pull request in one place.",
        points: [
          "Live GitHub metadata and full diffs",
          "AI recap posted back as a sticky comment",
          "Send a review comment straight to an agent",
        ],
        preview: "reviews",
      },
      {
        icon: TestingArenaIcon,
        name: "Testing Arena",
        summary: "Check the code against the spec.",
        points: [
          "Evaluates the codebase against a document's requirements",
          "Ranks the gaps it finds by severity",
          "Turn a gap into a task in one step",
        ],
        preview: "arena",
      },
    ],
  },
  {
    id: "operate",
    step: "04",
    label: "Operate",
    tagline: "Schedules, environments and the numbers.",
    heading: "The parts that keep it running.",
    intro:
      "Scheduling, environments, conventions, and the numbers that tell you whether any of it worked.",
    features: [
      {
        icon: AutomationsIcon,
        name: "Automations",
        summary: "Agent runs on a cron.",
        points: [
          "Report-only or fix-it-automatically",
          "Scheduled per repository",
          "Results land in your inbox",
        ],
        preview: "automations",
      },
      {
        icon: IconStack2,
        name: "Snapshots",
        summary: "Boot in seconds, not minutes.",
        points: [
          "Prebuilt image with tooling, dependencies and a seeded database",
          "Rebuild on a schedule or on demand",
          "Falls back to a fresh clone when one is missing",
        ],
        preview: "snapshots",
      },
      {
        icon: IconSparkles,
        name: "Skills",
        summary: "Your conventions travel with the agent.",
        points: [
          "Synced from .agents/skills on every push",
          "Refreshed every six hours",
          "Shared by every task in the repository",
        ],
        preview: "skills",
      },
      {
        icon: StatsIcon,
        name: "Stats",
        summary: "See what actually shipped.",
        points: [
          "Pull requests shipped and the session funnel",
          "Activity heatmap",
          "Contributor leaderboard",
        ],
        preview: "stats",
      },
      {
        icon: InboxIcon,
        name: "Inbox",
        summary: "Know when something needs you.",
        points: [
          "In-app notifications",
          "Optional daily digest",
          "Weekly changelog email",
        ],
        preview: "inbox",
      },
      {
        icon: IconUsers,
        name: "Teams",
        summary: "Workspaces, roles and secrets.",
        points: [
          "Members, roles and branding",
          "Encrypted environment variables",
          "Each app in a monorepo is its own workspace",
        ],
        preview: "teams",
      },
    ],
  },
] as const;

/**
 * Sandbox contents, mirroring the image definition in
 * `packages/backend/convex/snapshotActions.ts`. Versions are pinned there, so
 * update both together.
 */
export const LANDING_SANDBOX_SPEC = [
  { label: "Runtime", items: "Node 24 · pnpm · Docker Engine" },
  { label: "Agent CLIs", items: "Claude Code · Codex · opencode · Cursor" },
  {
    label: "Tooling",
    items: "git · git-lfs · gh · ripgrep · fd · jq · ffmpeg",
  },
  { label: "Desktop", items: "TigerVNC · noVNC · websockify · Google Chrome" },
  {
    label: "Data",
    items: "Convex CLI · Supabase CLI 2.90.0 · seeded databases",
  },
  {
    label: "Editing",
    items: "code-server · agent-browser · Claude Agent SDK",
  },
] as const;

/**
 * Startup log for the sandbox terminal mock, revealed a line at a time as the
 * section scrolls into view. Timings are representative of a snapshot boot, not
 * a measurement of any particular run.
 */
export type LandingBootKind = "command" | "info" | "ok";

export const LANDING_SANDBOX_BOOT: readonly {
  kind: LandingBootKind;
  text: string;
}[] = [
  { kind: "command", text: "eva sandbox create --repo acme/web" },
  { kind: "info", text: "Restoring snapshot acme-web@2026-07-27" },
  { kind: "ok", text: "Ready in 4.1s · Node 24 · docker 28.3.3" },
  { kind: "command", text: "pnpm install --frozen-lockfile" },
  { kind: "ok", text: "1284 packages · 6.2s" },
  { kind: "command", text: "supabase start" },
  { kind: "ok", text: "Postgres on 127.0.0.1:54322" },
  { kind: "command", text: "pnpm dev" },
  { kind: "ok", text: "Local: http://127.0.0.1:3000" },
];

export const LANDING_MCP_CARDS = [
  {
    icon: IconPlug,
    name: "Outward",
    summary: "Connect Eva to Claude Desktop.",
    points: [
      "External MCP clients connect over OAuth 2.1",
      "Around 25 tools, including read-only Convex and Postgres queries",
      "Create tasks, read documents, publish PR recaps, upload media",
    ],
  },
  {
    icon: IconBrowser,
    name: "Inward",
    summary: "Agents call back mid-task.",
    points: [
      "Every sandbox launches Eva as an MCP server",
      "An agent can read a document or ask a question while it works",
      "No context switch, no copy-paste",
    ],
  },
  {
    icon: IconLayoutDashboard,
    name: "Artifacts",
    summary: "Dashboards the agent builds for you.",
    points: [
      "Self-contained HTML pages hosted by Eva",
      "Rendered in a sandboxed iframe",
      "Query live data through MCP tools",
    ],
  },
] as const;

/** Tool calls shown in the MCP panel, in the order they animate in. */
export const LANDING_MCP_CALLS = [
  { tool: "list_repos", result: "4 repositories" },
  { tool: "get_document", result: "Checkout rework — PRD" },
  { tool: "create_task", result: "acme/web #142" },
  { tool: "run_query", result: "18 rows" },
] as const;

export const LANDING_OPEN_SOURCE_FACTS = [
  { label: "Licence", value: "MIT" },
  { label: "Hosting", value: "Self-hosted" },
  { label: "Your data", value: "Stays yours" },
] as const;

/** What the app is built on, shown as a logo row in the open-source section. */
export const LANDING_STACK: readonly { brand: BrandName; name: string }[] = [
  { brand: "vite", name: "Vite" },
  { brand: "tanstack", name: "TanStack Router" },
  { brand: "react", name: "React 19" },
  { brand: "tailwind", name: "Tailwind" },
  { brand: "convex", name: "Convex" },
  { brand: "vercel", name: "Vercel Sandbox" },
  { brand: "clerk", name: "Clerk" },
];
