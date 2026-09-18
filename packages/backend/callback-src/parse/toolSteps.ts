import { Option, Schema } from "effect";
import type { JsonObject, ProgressStep } from "../types.js";
import { shortenPath } from "../utils.js";
import {
  capCommand,
  capContentPreview,
  extractClaudeEdits,
  extractFilePaths,
  pickToolCallId,
  readNonBlankString,
  readNonEmptyString,
  readObject,
  readString,
  readTrimmedString,
  readTrueFlag,
  TrimmedStringSchema,
} from "./toolResultCapture.js";

/** Codex carries the thread id flat, or nested under a `thread` object. */
const CodexThreadIdSchema = Schema.transform(
  Schema.Union(
    Schema.Struct({ thread_id: TrimmedStringSchema }),
    Schema.Struct({ thread: Schema.Struct({ id: TrimmedStringSchema }) }),
  ),
  Schema.String,
  {
    strict: true,
    decode: (event) =>
      "thread_id" in event ? event.thread_id : event.thread.id,
    encode: (threadId) => ({ thread_id: threadId }) as const,
  },
);

/** Codex assistant prose arrives under either spelling of the item type. */
const CodexAgentMessageSchema = Schema.Struct({
  type: Schema.Literal("agent_message", "agentMessage"),
});

const decodeCodexThreadId = Schema.decodeUnknownOption(CodexThreadIdSchema);
const decodeCodexAgentMessage = Schema.decodeUnknownOption(
  CodexAgentMessageSchema,
);

const OPENCODE_PATH_KEYS = ["filePath", "file_path", "path"] as const;
const CURSOR_PATH_KEYS = [
  "path",
  "file_path",
  "filePath",
  "target_file",
  "targetFile",
  "relativePath",
  "relative_path",
] as const;
const CURSOR_COMMAND_KEYS = ["command", "cmd"] as const;
const CURSOR_QUERY_KEYS = [
  "query",
  "pattern",
  "url",
  "glob_pattern",
  "globPattern",
] as const;
const CURSOR_CONTENT_KEYS = [
  "fileText",
  "file_text",
  "content",
  "contents",
] as const;
const CURSOR_MCP_SERVER_KEYS = [
  "server",
  "serverName",
  "server_name",
  "toolName",
  "tool_name",
] as const;
const CODEX_PATH_KEYS = [
  "file_path",
  "path",
  "target_file",
  "target_path",
  "notebook_path",
] as const;
const CODEX_QUERY_KEYS = ["query", "pattern", "url"] as const;
const CODEX_COMMAND_KEYS = ["command", "cmd"] as const;
const CODEX_DESCRIPTION_KEYS = [
  "description",
  "name",
  "tool",
  "skill",
] as const;

/** Converts an opencode tool call event part into a UI progress step object. */
export function opencodeToolToStep(part: JsonObject): ProgressStep {
  const tool = readString(part, ["tool"]) ?? "tool";
  const state = readObject(part, ["state"]);
  const input: JsonObject = (state && readObject(state, ["input"])) ?? {};
  const rawPath = readString(input, OPENCODE_PATH_KEYS) ?? "";
  const path = rawPath ? shortenPath(rawPath) : "";
  const toolUseId = pickToolCallId(part) ?? readTrimmedString(part, ["callID"]);

  let step: ProgressStep;
  switch (tool) {
    case "read":
      step = {
        type: "read",
        label: "Reading file...",
        detail: path || undefined,
        path: rawPath || undefined,
        status: "active",
      };
      break;
    case "glob":
      step = {
        type: "search_files",
        label: "Searching files...",
        detail: readString(input, ["pattern"]),
        status: "active",
      };
      break;
    case "grep":
      step = {
        type: "search_code",
        label: "Searching code...",
        detail: readString(input, ["pattern"]),
        status: "active",
      };
      break;
    case "write": {
      const content = readString(input, ["content"]);
      step = {
        type: "write",
        label: "Creating file...",
        detail: path || undefined,
        path: rawPath || undefined,
        contentPreview: content ? capContentPreview(content) : undefined,
        status: "active",
      };
      break;
    }
    case "edit":
      step = {
        type: "edit",
        label: "Editing file...",
        detail: path || undefined,
        path: rawPath || undefined,
        edits: extractClaudeEdits(input),
        status: "active",
      };
      break;
    case "bash": {
      const rawCommand = readString(input, ["command"]) ?? "";
      step = {
        type: "bash",
        label: "Running command...",
        detail: rawCommand ? rawCommand.slice(0, 300) : undefined,
        command: rawCommand ? capCommand(rawCommand) : undefined,
        status: "active",
      };
      break;
    }
    case "webfetch":
      step = {
        type: "web_fetch",
        label: "Fetching URL...",
        detail: readString(input, ["url"]),
        status: "active",
      };
      break;
    case "websearch":
      step = {
        type: "web_search",
        label: "Searching web...",
        detail: readString(input, ["query"]),
        status: "active",
      };
      break;
    case "task":
      step = {
        type: "subtask",
        label: "Running agent...",
        detail: readString(input, ["description"]),
        status: "active",
      };
      break;
    case "todowrite":
    case "todoread":
      step = { type: "tool", label: "Updating tasks...", status: "active" };
      break;
    default:
      step = {
        type: "tool",
        label: "Using " + tool + "...",
        status: "active",
      };
      break;
  }
  if (toolUseId) {
    step.toolUseId = toolUseId;
  }
  return step;
}

/**
 * Converts a Cursor SDK tool_call event (flat `name` + `args`) into a UI
 * progress step. Known SDK tool kinds map directly; a heuristic chain catches
 * renamed/unknown tools since Cursor marks tool schemas as unstable.
 */
export function cursorSdkToolToStep(
  name: string,
  args: JsonObject,
): ProgressStep {
  const pickString = (keys: readonly string[]): string =>
    readNonBlankString(args, keys) ?? "";
  const rawPath = pickString(CURSOR_PATH_KEYS);
  const path = rawPath ? shortenPath(rawPath) : "";
  const command = pickString(CURSOR_COMMAND_KEYS);
  const query = pickString(CURSOR_QUERY_KEYS);

  switch (name) {
    case "read":
      return {
        type: "read",
        label: "Reading file...",
        detail: path || undefined,
        path: rawPath || undefined,
        status: "active",
      };
    case "write": {
      const fileText = pickString(CURSOR_CONTENT_KEYS);
      return {
        type: "write",
        label: "Creating file...",
        detail: path || undefined,
        path: rawPath || undefined,
        contentPreview: fileText ? capContentPreview(fileText) : undefined,
        status: "active",
      };
    }
    case "edit":
      return {
        type: "edit",
        label: "Editing file...",
        detail: path || undefined,
        path: rawPath || undefined,
        edits: extractClaudeEdits(args),
        status: "active",
      };
    case "delete":
      return {
        type: "edit",
        label: "Deleting file...",
        detail: path || undefined,
        path: rawPath || undefined,
        status: "active",
      };
    case "glob":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: query || path || undefined,
        status: "active",
      };
    case "ls":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: path || undefined,
        status: "active",
      };
    case "grep":
    case "semSearch":
      return {
        type: "search_code",
        label: "Searching code...",
        detail: query || path || undefined,
        status: "active",
      };
    case "shell":
      return {
        type: "bash",
        label: "Running command...",
        detail: command ? command.slice(0, 300) : undefined,
        command: command ? capCommand(command) : undefined,
        status: "active",
      };
    case "task":
      return {
        type: "subtask",
        label: "Running agent...",
        detail: pickString(["description", "prompt"]) || undefined,
        status: "active",
      };
    case "createPlan":
    case "updateTodos":
      return { type: "tool", label: "Updating tasks...", status: "active" };
    case "mcp": {
      const server = pickString(CURSOR_MCP_SERVER_KEYS);
      return {
        type: "tool",
        label: server ? "Using MCP " + server + "..." : "Using MCP tool...",
        status: "active",
      };
    }
  }

  const tool = name.toLowerCase();
  if (tool.includes("read")) {
    return {
      type: "read",
      label: "Reading file...",
      detail: path || undefined,
      path: rawPath || undefined,
      status: "active",
    };
  }
  if (tool.includes("write") || tool.includes("create")) {
    return {
      type: "write",
      label: "Creating file...",
      detail: path || undefined,
      path: rawPath || undefined,
      status: "active",
    };
  }
  if (
    tool.includes("edit") ||
    tool.includes("patch") ||
    tool.includes("apply") ||
    tool.includes("replace")
  ) {
    return {
      type: "edit",
      label: "Editing file...",
      detail: path || undefined,
      path: rawPath || undefined,
      status: "active",
      edits: extractClaudeEdits(args),
    };
  }
  if (tool.includes("delete") || tool.includes("remove")) {
    return {
      type: "edit",
      label: "Deleting file...",
      detail: path || undefined,
      path: rawPath || undefined,
      status: "active",
    };
  }
  if (tool.includes("glob") || tool.includes("list")) {
    return {
      type: "search_files",
      label: "Searching files...",
      detail: query || path || undefined,
      status: "active",
    };
  }
  if (tool.includes("grep") || tool.includes("search")) {
    return {
      type: tool.includes("file") ? "search_files" : "search_code",
      label: tool.includes("file") ? "Searching files..." : "Searching code...",
      detail: query || path || undefined,
      status: "active",
    };
  }
  if (
    tool.includes("bash") ||
    tool.includes("shell") ||
    tool.includes("exec") ||
    tool.includes("command") ||
    tool.includes("terminal")
  ) {
    return {
      type: "bash",
      label: "Running command...",
      detail: command ? command.slice(0, 300) : undefined,
      command: command ? capCommand(command) : undefined,
      status: "active",
    };
  }
  if (
    tool.includes("webfetch") ||
    tool.includes("web_fetch") ||
    (tool.includes("fetch") && !tool.includes("search"))
  ) {
    return {
      type: "web_fetch",
      label: "Fetching URL...",
      detail: query || undefined,
      status: "active",
    };
  }
  if (tool.includes("websearch") || tool.includes("web_search")) {
    return {
      type: "web_search",
      label: "Searching web...",
      detail: query || undefined,
      status: "active",
    };
  }
  if (tool.includes("todo") || tool.includes("plan")) {
    return { type: "tool", label: "Updating tasks...", status: "active" };
  }
  if (tool.includes("mcp")) {
    const server = pickString(CURSOR_MCP_SERVER_KEYS);
    return {
      type: "tool",
      label: server ? "Using MCP " + server + "..." : "Using MCP tool...",
      status: "active",
    };
  }
  return {
    type: "tool",
    label: "Using " + (name || "tool") + "...",
    status: "active",
  };
}

/** Converts a Claude tool call into a UI progress step object. */
export function toolCallToStep(name: string, input: JsonObject): ProgressStep {
  const rawPath = readString(input, ["file_path"]) ?? "";
  const path = rawPath ? shortenPath(rawPath) : "";
  switch (name) {
    case "Read":
      return {
        type: "read",
        label: "Reading file...",
        detail: path || undefined,
        path: rawPath || undefined,
        status: "active",
      };
    case "Glob":
      return {
        type: "search_files",
        label: "Searching files...",
        detail: readString(input, ["pattern"]),
        status: "active",
      };
    case "Grep":
      return {
        type: "search_code",
        label: "Searching code...",
        detail: readString(input, ["pattern"]),
        status: "active",
      };
    case "Write": {
      const content = readString(input, ["content"]);
      return {
        type: "write",
        label: "Creating file...",
        detail: path || undefined,
        path: rawPath || undefined,
        contentPreview: content ? capContentPreview(content) : undefined,
        status: "active",
      };
    }
    case "Edit": {
      const edits = extractClaudeEdits(input);
      return {
        type: "edit",
        label: "Editing file...",
        detail: path || undefined,
        path: rawPath || undefined,
        edits,
        status: "active",
      };
    }
    case "Bash":
    case "bash": {
      const rawCommand = readString(input, ["command"]) ?? "";
      return {
        type: "bash",
        label: readTrueFlag(input, ["run_in_background"])
          ? "Running in background..."
          : "Running command...",
        detail: rawCommand ? rawCommand.slice(0, 300) : undefined,
        command: rawCommand ? capCommand(rawCommand) : undefined,
        status: "active",
      };
    }
    case "KillShell":
      return {
        type: "bash",
        label: "Stopping background process...",
        detail: readString(input, ["shell_id", "shellId"]),
        status: "active",
      };
    case "Skill":
      return {
        type: "tool",
        label: "Using Skill...",
        detail: readString(input, ["skill"]),
        status: "active",
      };
    case "WebFetch":
      return {
        type: "web_fetch",
        label: "Fetching URL...",
        detail: readString(input, ["url"]),
        status: "active",
      };
    case "WebSearch":
      return {
        type: "web_search",
        label: "Searching web...",
        detail: readString(input, ["query"]),
        status: "active",
      };
    case "NotebookEdit": {
      const notebookPath = readString(input, ["notebook_path"]);
      return {
        type: "notebook",
        label: "Editing notebook...",
        detail:
          notebookPath === undefined ? undefined : shortenPath(notebookPath),
        path: notebookPath,
        status: "active",
      };
    }
    // Subagent spawn. Named `Agent` since claude-code v2.1.63; older CLIs emit
    // `Task`. Match both so subagent runs are always recognised (a bare `Task`
    // previously fell through to the generic "Using Task..." row).
    case "Agent":
    case "Task":
      return {
        type: "subtask",
        label: "Running agent...",
        detail: readString(input, ["description", "subagent_type"]),
        status: "active",
      };
    case "TodoWrite":
      return { type: "tool", label: "Updating tasks...", status: "active" };
    case "TodoRead":
      return { type: "tool", label: "Reading tasks...", status: "active" };
    case "AskUserQuestion":
      return {
        type: "question",
        label: "Asking a question...",
        status: "active",
      };
    default:
      return {
        type: "tool",
        label: "Using " + name + "...",
        status: "active",
      };
  }
}

function getCodexFieldValue(item: JsonObject, keys: readonly string[]): string {
  const direct = readTrimmedString(item, keys);
  if (direct !== undefined) {
    return direct;
  }
  const input = readObject(item, ["input"]);
  return (input && readTrimmedString(input, keys)) ?? "";
}

export function getCodexThreadId(event: JsonObject): string {
  return Option.getOrElse(decodeCodexThreadId(event), () => "");
}

export function getCodexAgentMessageText(item: JsonObject): string {
  if (Option.isNone(decodeCodexAgentMessage(item))) {
    return "";
  }
  const direct = readNonEmptyString(item, ["text"]);
  if (direct !== undefined) {
    return direct;
  }
  const content = item.content;
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    const text = readNonEmptyString(block, ["text", "content"]);
    if (text !== undefined) {
      parts.push(text);
    }
  }
  return parts.join("");
}

export function codexItemToStep(item: JsonObject): ProgressStep {
  const itemType = readTrimmedString(item, ["type"]) ?? "tool";
  const normalizedType = itemType.toLowerCase();
  const pathValue = getCodexFieldValue(item, CODEX_PATH_KEYS);
  const queryValue = getCodexFieldValue(item, CODEX_QUERY_KEYS);
  const commandValue = getCodexFieldValue(item, CODEX_COMMAND_KEYS);
  const descriptionValue = getCodexFieldValue(item, CODEX_DESCRIPTION_KEYS);
  const normalizedDescription = descriptionValue.toLowerCase();
  const pathDetail = pathValue ? shortenPath(pathValue) : "";
  const itemId = readTrimmedString(item, ["id"]);

  const withId = (step: ProgressStep): ProgressStep => {
    if (itemId) step.toolUseId = itemId;
    return step;
  };

  if (
    normalizedType.includes("file_change") ||
    normalizedType === "filechange"
  ) {
    const files = extractFilePaths(item);
    return withId({
      type: "edit",
      label: "Editing file...",
      detail: files[0] ? shortenPath(files[0]) : pathDetail || undefined,
      path: files[0] || pathValue || undefined,
      files: files.length > 0 ? files : undefined,
      status: "active",
    });
  }

  if (normalizedType === "mcp_tool_call" || normalizedType === "mcptoolcall") {
    if (normalizedDescription.includes("fetch_file")) {
      return withId({
        type: "read",
        label: "Reading file...",
        detail: descriptionValue || undefined,
        status: "active",
      });
    }
    if (
      normalizedDescription.includes("search") ||
      normalizedDescription.includes("list_repositories") ||
      normalizedDescription.includes("list_mcp_resources")
    ) {
      return withId({
        type: "search_code",
        label: "Searching code...",
        detail: descriptionValue || undefined,
        status: "active",
      });
    }
    return withId({
      type: "tool",
      label: "Using MCP...",
      detail: descriptionValue || undefined,
      status: "active",
    });
  }

  if (normalizedType.includes("web")) {
    return withId({
      type: normalizedType.includes("search") ? "web_search" : "web_fetch",
      label: normalizedType.includes("search")
        ? "Searching web..."
        : "Fetching URL...",
      detail: queryValue || pathDetail || undefined,
      status: "active",
    });
  }
  if (normalizedType.includes("read")) {
    return withId({
      type: "read",
      label: "Reading file...",
      detail: pathDetail || undefined,
      path: pathValue || undefined,
      status: "active",
    });
  }
  if (normalizedType.includes("grep") || normalizedType.includes("search")) {
    return withId({
      type: normalizedType.includes("file") ? "search_files" : "search_code",
      label: normalizedType.includes("file")
        ? "Searching files..."
        : "Searching code...",
      detail: queryValue || pathDetail || undefined,
      status: "active",
    });
  }
  if (normalizedType.includes("glob") || normalizedType.includes("list")) {
    return withId({
      type: "search_files",
      label: "Searching files...",
      detail: queryValue || pathDetail || undefined,
      status: "active",
    });
  }
  if (normalizedType.includes("write") || normalizedType.includes("create")) {
    return withId({
      type: "write",
      label: "Creating file...",
      detail: pathDetail || undefined,
      path: pathValue || undefined,
      status: "active",
    });
  }
  if (
    normalizedType.includes("edit") ||
    normalizedType.includes("patch") ||
    normalizedType.includes("apply")
  ) {
    return withId({
      type: "edit",
      label: "Editing file...",
      detail: pathDetail || undefined,
      path: pathValue || undefined,
      status: "active",
    });
  }
  if (
    normalizedType.includes("command") ||
    normalizedType.includes("shell") ||
    normalizedType.includes("bash") ||
    normalizedType.includes("exec")
  ) {
    return withId({
      type: "bash",
      label: "Running command...",
      detail: commandValue || descriptionValue || undefined,
      command: commandValue ? capCommand(commandValue) : undefined,
      status: "active",
    });
  }
  if (normalizedType.includes("agent") || normalizedType === "collabtoolcall") {
    return withId({
      type: "subtask",
      label: "Running agent...",
      detail: descriptionValue || undefined,
      status: "active",
    });
  }
  return withId({
    type: "tool",
    label: "Using " + itemType + "...",
    detail: descriptionValue || pathDetail || queryValue || undefined,
    status: "active",
  });
}
