import { IconCheck, IconFileCode, IconFolder } from "@tabler/icons-react";
import { Spinner, cn } from "@eva/ui";
import { MockChip, MockDot, MockLabel, MockWindow } from "./MockParts";

const AUTOMATIONS = [
  {
    name: "Dependency sweep",
    schedule: "Every Monday, 07:00",
    mode: "Fix" as const,
    next: "in 2 days",
  },
  {
    name: "Flaky test report",
    schedule: "Nightly, 02:00",
    mode: "Report" as const,
    next: "in 9 hours",
  },
  {
    name: "Type coverage audit",
    schedule: "Every 6 hours",
    mode: "Report" as const,
    next: "in 41 minutes",
  },
];

/** Scheduled agent runs, each either reporting or fixing on its own. */
export function AutomationsPreview() {
  return (
    <MockWindow
      title="acme/web · automations"
      trailing={<MockChip tone="success">3 active</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="space-y-1.5">
        {AUTOMATIONS.map((automation) => (
          <div
            key={automation.name}
            className="flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2"
          >
            <MockDot tone="success" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-medium text-foreground">
                {automation.name}
              </p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {automation.schedule}
              </p>
            </div>
            <MockChip tone={automation.mode === "Fix" ? "primary" : "neutral"}>
              {automation.mode}
            </MockChip>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-border bg-muted/25 p-3">
        <MockLabel>Next run</MockLabel>
        <p className="mt-1.5 text-[11px] text-foreground">
          Type coverage audit —{" "}
          <span className="text-muted-foreground">in 41 minutes</span>
        </p>
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          Findings arrive in your inbox. Fix-mode runs open a pull request.
        </p>
      </div>
    </MockWindow>
  );
}

const SNAPSHOT_STEPS = [
  { label: "Pull base image", time: "0:22", done: true },
  { label: "Install agent CLIs", time: "1:04", done: true },
  { label: "pnpm install", time: "2:41", done: true },
  { label: "Seed Postgres", time: "1:18", done: true },
  { label: "Commit snapshot", time: "0:36", done: false },
];

/** Snapshot build: minutes once, then seconds for every task that uses it. */
export function SnapshotsPreview() {
  return (
    <MockWindow
      title="acme/web · snapshot build"
      trailing={<MockChip tone="warning">Building</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-muted/25 p-2.5">
          <MockLabel>Cold clone</MockLabel>
          <p className="mt-1 text-lg font-semibold tabular-nums text-muted-foreground">
            6m 01s
          </p>
        </div>
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <MockLabel>From snapshot</MockLabel>
          <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
            4.1s
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {SNAPSHOT_STEPS.map((step) => (
          <div
            key={step.label}
            className="flex items-center gap-2.5 px-0.5 py-1"
          >
            {step.done ? (
              <IconCheck
                size={12}
                className="shrink-0 text-success"
                aria-hidden
              />
            ) : (
              <Spinner size="sm" className="size-3 shrink-0" aria-hidden />
            )}
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-[11px]",
                step.done ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </p>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {step.time}
            </span>
          </div>
        ))}
      </div>
    </MockWindow>
  );
}

const SKILL_FILES = [
  { name: "ship.md", detail: "Commit, push, open a PR" },
  { name: "changelog.md", detail: "How we write release notes" },
  { name: "convex-schema.md", detail: "Migration rules" },
  { name: "review.md", detail: "What to check before merge" },
];

/** Skills synced out of the repository so conventions travel with the agent. */
export function SkillsPreview() {
  return (
    <MockWindow
      title="acme/web · skills"
      trailing={<MockChip tone="success">Synced 2h ago</MockChip>}
      bodyClassName="p-3.5"
    >
      <div className="flex items-center gap-2 px-0.5">
        <IconFolder size={13} className="text-muted-foreground" aria-hidden />
        <p className="font-mono text-[11px] text-foreground">.agents/skills</p>
      </div>

      <div className="mt-2 space-y-0.5 border-l border-border pl-3.5">
        {SKILL_FILES.map((file) => (
          <div
            key={file.name}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/30"
          >
            <IconFileCode
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-hidden
            />
            <p className="shrink-0 font-mono text-[11px] text-foreground">
              {file.name}
            </p>
            <p className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
              {file.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/25 px-2.5 py-2">
        <MockDot tone="primary" pulse />
        <p className="truncate text-[10.5px] text-muted-foreground">
          Re-synced on every push, and again every six hours.
        </p>
      </div>
    </MockWindow>
  );
}
