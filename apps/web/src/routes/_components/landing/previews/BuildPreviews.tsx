import { IconCheck, IconGitBranch } from "@tabler/icons-react";
import { Spinner, cn } from "@eva/ui";
import { BrandMark, type BrandName } from "../BrandMark";
import {
  MockChip,
  MockDot,
  MockLabel,
  MockLine,
  MockWindow,
} from "./MockParts";

const WORKSPACE_TABS = ["Preview", "Terminal", "Files", "Diff"];

const TERMINAL_LINES = [
  { prompt: true, text: "pnpm test checkout" },
  { prompt: false, text: "✓ validate.spec.ts (12)" },
  { prompt: false, text: "✓ totals.spec.ts (8)" },
  { prompt: false, text: "20 passed in 3.4s" },
];

/** Live session: agent chat on the left, the sandbox workspace on the right. */
export function SessionsPreview() {
  return (
    <MockWindow
      title="acme/web · session"
      trailing={
        <span className="flex items-center gap-1.5">
          <MockDot tone="success" pulse />
          <span className="text-[10px] text-muted-foreground">Sandbox up</span>
        </span>
      }
    >
      <div className="grid h-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-2.5 border-r border-border p-3">
          <MockLabel>Chat</MockLabel>
          <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm border border-border bg-muted px-2.5 py-1.5">
            <p className="text-[10.5px] leading-relaxed text-foreground">
              Postcodes with a space fail validation.
            </p>
          </div>
          <div className="max-w-[90%] space-y-1.5 rounded-lg rounded-bl-sm border border-border bg-card px-2.5 py-2">
            <MockLine width="w-full" />
            <MockLine width="w-[80%]" />
            <MockLine width="w-[55%]" />
          </div>
          <div className="mt-auto flex items-center gap-1.5">
            <MockDot tone="primary" pulse />
            <span className="text-[10px] text-muted-foreground">
              Editing validate.ts
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1.5 sm:gap-1 sm:px-2">
            {WORKSPACE_TABS.map((tab, index) => (
              <span
                key={tab}
                className={cn(
                  "rounded-md border px-1.5 py-1 text-[10px] font-medium sm:px-2",
                  index === 1
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="flex-1 space-y-1.5 bg-muted/20 p-3 font-mono text-[10px] leading-relaxed">
            {TERMINAL_LINES.map((line) => (
              <p
                key={line.text}
                className={cn(
                  "truncate",
                  line.prompt ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {line.prompt ? <span className="text-primary">$ </span> : null}
                {line.text}
              </p>
            ))}
            <p className="text-muted-foreground">
              <span className="text-primary">$ </span>
              <span className="landing-pulse-dot inline-block h-3 w-1.5 translate-y-0.5 bg-foreground" />
            </p>
          </div>
        </div>
      </div>
    </MockWindow>
  );
}

const QUICK_TASKS = [
  { title: "Fix postcode validation", state: "running" as const, repo: "#142" },
  { title: "Bump vite to 8.1", state: "running" as const, repo: "#141" },
  { title: "Add empty state to inbox", state: "review" as const, repo: "#140" },
  { title: "Delete unused feature flag", state: "done" as const, repo: "#139" },
  { title: "Tidy the README badges", state: "done" as const, repo: "#138" },
];

const TASK_STATE = {
  running: { label: "Running", tone: "warning" as const },
  review: { label: "In review", tone: "review" as const },
  done: { label: "Merged", tone: "success" as const },
};

/** Five independent tasks, each on its own sandbox and branch. */
export function QuickTasksPreview() {
  return (
    <MockWindow
      title="acme/web · quick tasks"
      trailing={<MockChip tone="warning">2 running</MockChip>}
      bodyClassName="p-3"
    >
      <div className="space-y-1.5">
        {QUICK_TASKS.map((task) => {
          const state = TASK_STATE[task.state];
          return (
            <div
              key={task.title}
              className="flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2"
            >
              {task.state === "running" ? (
                <Spinner
                  size="sm"
                  className="size-[13px] shrink-0"
                  aria-hidden
                />
              ) : (
                <IconCheck
                  size={13}
                  className={cn(
                    "shrink-0",
                    task.state === "done" ? "text-success" : "text-chart-3",
                  )}
                  aria-hidden
                />
              )}
              <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">
                {task.title}
              </p>
              <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground sm:flex">
                <IconGitBranch size={11} aria-hidden />
                {task.repo}
              </span>
              <MockChip tone={state.tone}>{state.label}</MockChip>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[10.5px] text-muted-foreground">
        Every task gets its own sandbox — they do not queue behind each other.
      </p>
    </MockWindow>
  );
}

const AGENTS: readonly {
  brand: BrandName;
  name: string;
  model: string;
  selected: boolean;
}[] = [
  { brand: "claude", name: "Claude Code", model: "Opus 5", selected: true },
  { brand: "openai", name: "Codex", model: "GPT-5", selected: false },
  {
    brand: "opencode",
    name: "opencode",
    model: "Bring your own",
    selected: false,
  },
  { brand: "cursor", name: "Cursor", model: "Composer", selected: false },
];

/** Agent picker: four CLIs preinstalled, chosen per task. */
export function AgentsPreview() {
  return (
    <MockWindow
      title="new task · choose an agent"
      trailing={<MockChip tone="primary">Per task</MockChip>}
      bodyClassName="p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className={cn(
              "flex flex-col gap-1 rounded-md border p-3",
              agent.selected
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <BrandMark name={agent.brand} size={14} />
                <span className="truncate text-[11.5px] font-medium text-foreground">
                  {agent.name}
                </span>
              </span>
              {agent.selected ? (
                <IconCheck size={13} className="text-primary" aria-hidden />
              ) : null}
            </div>
            <p className="truncate text-[10px] text-muted-foreground">
              {agent.model}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/25 p-3">
        <MockLabel>Credentials</MockLabel>
        <p className="font-mono text-[10px] text-muted-foreground">
          ANTHROPIC_API_KEY <span className="text-success">✓ set</span>
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          OPENAI_API_KEY <span className="text-success">✓ set</span>
        </p>
        <p className="text-[10px] text-muted-foreground">
          Encrypted per team, injected into the sandbox at boot.
        </p>
      </div>
    </MockWindow>
  );
}
