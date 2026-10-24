import type {
  ActivityQuestion,
  ActivityStep,
  ModelAccount,
  ModelOption,
} from "@eva/ui";

/** Fixed sample data for the `ai-activity` gallery section. */

export const GALLERY_STEPS: ActivityStep[] = [
  {
    type: "reasoning",
    label: "Thought",
    detail: "Read the activity code first, then run the type check.",
    durationMs: 4000,
    status: "complete",
  },
  {
    type: "read",
    label: "Read activity-tasks.tsx",
    path: "packages/ui/src/ai-elements/activity-tasks.tsx",
    durationMs: 300,
    status: "complete",
  },
  {
    type: "edit",
    label: "Edited trace.tsx",
    path: "packages/ui/src/ai-elements/trace.tsx",
    edits: [{ oldText: "gap-1", newText: "gap-2" }],
    durationMs: 1200,
    status: "complete",
  },
  {
    type: "write",
    label: "Wrote notes.md",
    path: "docs/notes.md",
    contentPreview: "# Notes\n\nTrace replaces the Reasoning fold.",
    status: "complete",
  },
  {
    type: "bash",
    label: "Ran command",
    detail: "pnpm tsc --noEmit",
    command: "pnpm tsc --noEmit",
    output: { text: "src/a.tsx(12,3): error TS2322", exitCode: 2 },
    isError: true,
    durationMs: 8200,
    status: "complete",
  },
  {
    type: "search_files",
    label: "Searched files",
    detail: "**/*.tsx",
    durationMs: 200,
    status: "complete",
  },
  {
    type: "search_code",
    label: "Searched code",
    detail: "ActivityTasks",
    durationMs: 1400,
    status: "complete",
  },
  {
    type: "web_search",
    label: "Searched the web",
    detail: "radix collapsible animation",
    status: "complete",
  },
  {
    type: "web_fetch",
    label: "Fetched page",
    detail: "https://example.com/docs",
    status: "complete",
  },
  {
    type: "subtask",
    label: "Explore: find activity consumers",
    toolUseId: "gallery-agent",
    status: "complete",
    durationMs: 21000,
  },
  {
    type: "search_code",
    label: "Searched code",
    detail: "ActivityTasks",
    parentToolUseId: "gallery-agent",
    durationMs: 1400,
    status: "complete",
  },
  {
    type: "read",
    label: "Read ChatBody.tsx",
    path: "apps/web/src/lib/components/chat/ChatBody.tsx",
    parentToolUseId: "gallery-agent",
    status: "complete",
  },
  {
    type: "todos",
    label: "Updated todos",
    todos: [
      { content: "Read the activity code", status: "completed" },
      { content: "Move callers to Trace", status: "in_progress" },
      { content: "Run the type check", status: "pending" },
    ],
    status: "complete",
  },
  {
    type: "tool",
    label: "mcp__eva__list_tasks",
    detail: "status: open",
    status: "complete",
  },
  {
    type: "notice",
    label: "Context compacted",
    status: "complete",
  },
  {
    type: "hook",
    label: "PreToolUse hook",
    detail: "lint-staged",
    status: "complete",
  },
  {
    type: "steer",
    label: "Also update the changelog",
    status: "complete",
  },
  {
    type: "response",
    label: "Response",
    detail: "Both callers now render through Trace.",
    status: "complete",
  },
  {
    type: "bash",
    label: "Running pnpm test",
    command: "pnpm test",
    status: "active",
  },
];

/** Short timeline for the folded "Worked for …" specimen. */
export const SHORT_STEPS: ActivityStep[] = GALLERY_STEPS.slice(0, 5);

export const GALLERY_QUESTIONS: ActivityQuestion[] = [
  {
    question: "Which layout should the activity timeline use?",
    header: "Layout",
    options: [
      { label: "Folded", description: "Collapse settled turns." },
      { label: "Inline", description: "Keep every step open." },
    ],
  },
  {
    question: "Which checks should run?",
    header: "Checks",
    multiSelect: true,
    options: [{ label: "Typecheck" }, { label: "Lint" }, { label: "Tests" }],
  },
];

export const GALLERY_ANSWERS: Record<string, string> = {
  "Which layout should the activity timeline use?": "Folded",
};

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "claude-opus", provider: "claude", label: "Opus" },
  { id: "claude-sonnet", provider: "claude", label: "Sonnet" },
  { id: "claude-haiku", provider: "claude", label: "Haiku" },
  { id: "gpt-5", provider: "codex", label: "GPT-5" },
  { id: "gpt-5-mini", provider: "codex", label: "GPT-5 mini" },
  { id: "opencode-default", provider: "opencode", label: "Default" },
  { id: "cursor-auto", provider: "cursor", label: "Auto" },
];

export const MODEL_ACCOUNTS: ModelAccount[] = [
  { id: "acct-own", provider: "claude", label: "Ada Lovelace", isOwn: true },
];

export const CONSOLE_LOGS: {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: Date;
}[] = [
  {
    level: "log",
    message: "[vite] connected.",
    timestamp: new Date(Date.UTC(2025, 2, 14, 9, 30, 0)),
  },
  {
    level: "warn",
    message: "React Router future flag warning",
    timestamp: new Date(Date.UTC(2025, 2, 14, 9, 30, 2)),
  },
  {
    level: "error",
    message: "Failed to load resource: 404",
    timestamp: new Date(Date.UTC(2025, 2, 14, 9, 30, 5)),
  },
];

export const PREVIEW_SRC_DOC =
  "<html><body style='font-family:sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#f4f4f5;color:#18181b'><p>Static preview body</p></body></html>";
