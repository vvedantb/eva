import { describe, expect, test } from "vitest";
import {
  codexItemToStep,
  cursorSdkToolToStep,
  opencodeToolToStep,
  toolCallToStep,
} from "../parse/toolSteps.js";
import type { JsonObject, ProgressStep } from "../types.js";

const LONG_PATH = "/repo/packages/backend/src/index.ts";
const SHORT_PATH = ".../backend/src/index.ts";
const LONG_COMMAND = "echo " + "x".repeat(400);

const read = (): ProgressStep => ({
  type: "read",
  label: "Reading file...",
  detail: SHORT_PATH,
  path: LONG_PATH,
  status: "active",
});
const write = (extra: Partial<ProgressStep> = {}): ProgressStep => ({
  type: "write",
  label: "Creating file...",
  detail: SHORT_PATH,
  path: LONG_PATH,
  status: "active",
  ...extra,
});
const edit = (extra: Partial<ProgressStep> = {}): ProgressStep => ({
  type: "edit",
  label: "Editing file...",
  detail: SHORT_PATH,
  path: LONG_PATH,
  status: "active",
  ...extra,
});
const bash = (detail: string, command?: string): ProgressStep => ({
  type: "bash",
  label: "Running command...",
  detail,
  command,
  status: "active",
});
const searchFiles = (detail: string): ProgressStep => ({
  type: "search_files",
  label: "Searching files...",
  detail,
  status: "active",
});
const searchCode = (detail: string): ProgressStep => ({
  type: "search_code",
  label: "Searching code...",
  detail,
  status: "active",
});
const webFetch = (detail: string): ProgressStep => ({
  type: "web_fetch",
  label: "Fetching URL...",
  detail,
  status: "active",
});
const webSearch = (detail?: string): ProgressStep => ({
  type: "web_search",
  label: "Searching web...",
  detail,
  status: "active",
});
const subtask = (detail: string): ProgressStep => ({
  type: "subtask",
  label: "Running agent...",
  detail,
  status: "active",
});
const tool = (label: string, detail?: string): ProgressStep => ({
  type: "tool",
  label,
  detail,
  status: "active",
});
const EDITS = [{ oldText: "a", newText: "b" }];

describe("toolCallToStep (Claude)", () => {
  const cases: [string, JsonObject, ProgressStep][] = [
    ["Read", { file_path: LONG_PATH }, read()],
    [
      "Write",
      { file_path: LONG_PATH, content: "hi" },
      write({ contentPreview: "hi" }),
    ],
    [
      "Edit",
      { file_path: LONG_PATH, old_string: "a", new_string: "b" },
      edit({ edits: EDITS }),
    ],
    ["Glob", { pattern: "**/*.ts" }, searchFiles("**/*.ts")],
    ["Grep", { pattern: "foo" }, searchCode("foo")],
    [
      "Bash",
      { command: LONG_COMMAND },
      bash(LONG_COMMAND.slice(0, 300), LONG_COMMAND),
    ],
    [
      "Bash",
      { command: "ls", run_in_background: true },
      { ...bash("ls", "ls"), label: "Running in background..." },
    ],
    [
      "KillShell",
      { shell_id: "s1" },
      {
        type: "bash",
        label: "Stopping background process...",
        detail: "s1",
        status: "active",
      },
    ],
    ["WebFetch", { url: "https://x.dev" }, webFetch("https://x.dev")],
    ["WebSearch", { query: "q" }, webSearch("q")],
    ["Agent", { subagent_type: "explore" }, subtask("explore")],
    ["TodoWrite", {}, tool("Updating tasks...")],
    ["TodoRead", {}, tool("Reading tasks...")],
    ["Skill", { skill: "ship" }, tool("Using Skill...", "ship")],
    ["Mystery", {}, tool("Using Mystery...")],
  ];
  test.each(cases)("%s", (name, input, expected) => {
    expect(toolCallToStep(name, input)).toEqual(expected);
  });
});

describe("opencodeToolToStep", () => {
  const cases: [string, JsonObject, ProgressStep][] = [
    ["read", { filePath: LONG_PATH }, read()],
    [
      "write",
      { filePath: LONG_PATH, content: "hi" },
      write({ contentPreview: "hi" }),
    ],
    [
      "edit",
      { filePath: LONG_PATH, old_string: "a", new_string: "b" },
      edit({ edits: EDITS }),
    ],
    ["glob", { pattern: "*.ts" }, searchFiles("*.ts")],
    ["grep", { pattern: "foo" }, searchCode("foo")],
    ["bash", { command: "ls" }, bash("ls", "ls")],
    ["webfetch", { url: "https://x.dev" }, webFetch("https://x.dev")],
    ["websearch", { query: "q" }, webSearch("q")],
    ["task", { description: "explore" }, subtask("explore")],
    ["todowrite", {}, tool("Updating tasks...")],
    ["mystery", {}, tool("Using mystery...")],
  ];
  test.each(cases)("%s", (name, input, expected) => {
    expect(
      opencodeToolToStep({ tool: name, callID: "c1", state: { input } }),
    ).toEqual({ ...expected, toolUseId: "c1" });
  });
});

describe("cursorSdkToolToStep", () => {
  const cases: [string, JsonObject, ProgressStep][] = [
    // Known SDK kinds.
    ["read", { path: LONG_PATH }, read()],
    [
      "write",
      { path: LONG_PATH, fileText: "hi" },
      write({ contentPreview: "hi" }),
    ],
    [
      "edit",
      { path: LONG_PATH, old_string: "a", new_string: "b" },
      edit({ edits: EDITS }),
    ],
    ["delete", { path: LONG_PATH }, edit({ label: "Deleting file..." })],
    ["glob", { glob_pattern: "*.ts" }, searchFiles("*.ts")],
    ["grep", { pattern: "foo" }, searchCode("foo")],
    ["shell", { command: "ls" }, bash("ls", "ls")],
    ["task", { prompt: "explore" }, subtask("explore")],
    ["updateTodos", {}, tool("Updating tasks...")],
    ["mcp", { server: "linear" }, tool("Using MCP linear...")],
    // Keyword fallback for renamed / unknown tools.
    ["readFileV2", { path: LONG_PATH }, read()],
    ["createFile", { path: LONG_PATH }, write()],
    [
      "applyPatch",
      { path: LONG_PATH, old_string: "a", new_string: "b" },
      edit({ edits: EDITS }),
    ],
    ["fileSearch", { query: "foo" }, searchFiles("foo")],
    ["codebaseSearch", { query: "foo" }, searchCode("foo")],
    ["runTerminal", { cmd: "ls" }, bash("ls", "ls")],
    ["urlFetch", { url: "https://x.dev" }, webFetch("https://x.dev")],
    ["updatePlan", {}, tool("Updating tasks...")],
    ["mcpCall", {}, tool("Using MCP tool...")],
    ["mystery", {}, tool("Using mystery...")],
  ];
  test.each(cases)("%s", (name, args, expected) => {
    expect(cursorSdkToolToStep(name, args)).toEqual(expected);
  });
});

describe("codexItemToStep", () => {
  const cases: [JsonObject, ProgressStep][] = [
    [{ type: "read_file", path: LONG_PATH }, read()],
    [{ type: "write_file", path: LONG_PATH }, write()],
    [{ type: "apply_patch", path: LONG_PATH }, edit()],
    [
      { type: "file_change", changes: [{ path: LONG_PATH }] },
      edit({ files: [LONG_PATH] }),
    ],
    [{ type: "grep", query: "foo" }, searchCode("foo")],
    [{ type: "file_search", query: "foo" }, searchFiles("foo")],
    [{ type: "list_dir", path: LONG_PATH }, searchFiles(SHORT_PATH)],
    [
      { type: "command_execution", command: LONG_COMMAND },
      bash(LONG_COMMAND.slice(0, 300), LONG_COMMAND),
    ],
    [
      { type: "command_execution", description: "Run tests" },
      {
        type: "bash",
        label: "Running command...",
        detail: "Run tests",
        status: "active",
      },
    ],
    [{ type: "web_search", query: "x" }, webSearch("x")],
    [{ type: "webSearch" }, webSearch()],
    [{ type: "web_fetch", url: "https://x.dev" }, webFetch("https://x.dev")],
    [{ type: "collabToolCall", description: "explore" }, subtask("explore")],
    [
      { type: "mcp_tool_call", name: "github.search_code" },
      searchCode("github.search_code"),
    ],
    [
      { type: "mcp_tool_call", name: "linear.save_issue" },
      tool("Using MCP...", "linear.save_issue"),
    ],
    [
      { type: "reasoning_summary", description: "thinking" },
      tool("Using reasoning_summary...", "thinking"),
    ],
  ];
  test.each(cases)("%j", (item, expected) => {
    expect(codexItemToStep({ ...item, id: "i1" })).toEqual({
      ...expected,
      toolUseId: "i1",
    });
  });
});
