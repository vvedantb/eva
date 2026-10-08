import type { JsonObject, JsonValue, ProgressStep } from "../types.js";
import { shortenPath } from "../utils.js";
import { parseQuestionInput } from "./questionInput.js";
import { STEP_FIELD_CAPS } from "./stepBudget.js";
import {
  capCommand,
  capContentPreview,
  extractClaudeEdits,
  extractFilePaths,
  pickToolCallId,
} from "./toolResultCapture.js";

// Shared step builders. Every mapper below returns one of these so a step
// kind has exactly one shape and one label.

type StepExtra = Partial<Omit<ProgressStep, "type" | "label" | "status">>;

function stringOrUndefined(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function fileStep(
  type: "read" | "write" | "edit",
  label: string,
  rawPath: string,
  extra: StepExtra = {},
): ProgressStep {
  return {
    type,
    label,
    detail: rawPath ? shortenPath(rawPath) : undefined,
    path: rawPath || undefined,
    status: "active",
    ...extra,
  };
}

function bashStep(
  command: string,
  label = "Running command...",
  fallbackDetail = "",
): ProgressStep {
  return {
    type: "bash",
    label,
    detail: command
      ? command.slice(0, STEP_FIELD_CAPS.commandDetail)
      : fallbackDetail || undefined,
    command: command ? capCommand(command) : undefined,
    status: "active",
  };
}

function searchStep(
  kind: "files" | "code",
  detail: string | undefined,
): ProgressStep {
  return kind === "files"
    ? {
        type: "search_files",
        label: "Searching files...",
        detail,
        status: "active",
      }
    : {
        type: "search_code",
        label: "Searching code...",
        detail,
        status: "active",
      };
}

function webStep(
  kind: "fetch" | "search",
  detail: string | undefined,
): ProgressStep {
  return kind === "fetch"
    ? { type: "web_fetch", label: "Fetching URL...", detail, status: "active" }
    : {
        type: "web_search",
        label: "Searching web...",
        detail,
        status: "active",
      };
}

function subtaskStep(detail: string | undefined): ProgressStep {
  return {
    type: "subtask",
    label: "Running agent...",
    detail,
    status: "active",
  };
}

function toolStep(label: string, detail?: string): ProgressStep {
  return { type: "tool", label, detail, status: "active" };
}

function todosStep(): ProgressStep {
  return toolStep("Updating tasks...");
}

function opencodeStepFor(
  tool: string,
  input: JsonObject,
  rawPath: string,
): ProgressStep {
  switch (tool) {
    case "read":
      return fileStep("read", "Reading file...", rawPath);
    case "glob":
      return searchStep("files", stringOrUndefined(input.pattern));
    case "grep":
      return searchStep("code", stringOrUndefined(input.pattern));
    case "write": {
      const content = stringOrUndefined(input.content);
      return fileStep("write", "Creating file...", rawPath, {
        contentPreview: content ? capContentPreview(content) : undefined,
      });
    }
    case "edit":
      return fileStep("edit", "Editing file...", rawPath, {
        edits: extractClaudeEdits(input),
      });
    case "bash":
      return bashStep(stringOrUndefined(input.command) ?? "");
    case "webfetch":
      return webStep("fetch", stringOrUndefined(input.url));
    case "websearch":
      return webStep("search", stringOrUndefined(input.query));
    case "task":
      return subtaskStep(stringOrUndefined(input.description));
    case "todowrite":
    case "todoread":
      return todosStep();
    default:
      return toolStep("Using " + tool + "...");
  }
}

/** Converts an opencode tool call event part into a UI progress step object. */
export function opencodeToolToStep(part: JsonObject): ProgressStep {
  const tool = typeof part.tool === "string" ? part.tool : "tool";
  const stateObj =
    part.state && typeof part.state === "object" && !Array.isArray(part.state)
      ? part.state
      : null;
  const input: JsonObject =
    stateObj &&
    "input" in stateObj &&
    stateObj.input &&
    typeof stateObj.input === "object" &&
    !Array.isArray(stateObj.input)
      ? stateObj.input
      : {};
  const rawPath =
    stringOrUndefined(input.filePath) ??
    stringOrUndefined(input.file_path) ??
    stringOrUndefined(input.path) ??
    "";
  const toolUseId =
    pickToolCallId(part) ??
    (typeof part.callID === "string" && part.callID.trim()
      ? part.callID.trim()
      : undefined);

  const step = opencodeStepFor(tool, input, rawPath);
  if (toolUseId) {
    step.toolUseId = toolUseId;
  }
  return step;
}

const MCP_SERVER_KEYS = [
  "server",
  "serverName",
  "server_name",
  "toolName",
  "tool_name",
];

/**
 * Converts a Cursor SDK tool_call event (flat `name` + `args`) into a UI
 * progress step. Known SDK tool kinds map directly; a heuristic chain catches
 * renamed/unknown tools since Cursor marks tool schemas as unstable.
 */
export function cursorSdkToolToStep(
  name: string,
  args: JsonObject,
): ProgressStep {
  const pickString = (keys: string[]): string => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return "";
  };
  const rawPath = pickString([
    "path",
    "file_path",
    "filePath",
    "target_file",
    "targetFile",
    "relativePath",
    "relative_path",
  ]);
  const path = rawPath ? shortenPath(rawPath) : "";
  const command = pickString(["command", "cmd"]);
  const query = pickString([
    "query",
    "pattern",
    "url",
    "glob_pattern",
    "globPattern",
  ]);
  const editStep = (): ProgressStep =>
    fileStep("edit", "Editing file...", rawPath, {
      edits: extractClaudeEdits(args),
    });
  const deleteStep = (): ProgressStep =>
    fileStep("edit", "Deleting file...", rawPath);
  const mcpStep = (): ProgressStep => {
    const server = pickString(MCP_SERVER_KEYS);
    return toolStep(
      server ? "Using MCP " + server + "..." : "Using MCP tool...",
    );
  };

  switch (name) {
    case "read":
      return fileStep("read", "Reading file...", rawPath);
    case "write": {
      const fileText = pickString([
        "fileText",
        "file_text",
        "content",
        "contents",
      ]);
      return fileStep("write", "Creating file...", rawPath, {
        contentPreview: fileText ? capContentPreview(fileText) : undefined,
      });
    }
    case "edit":
      return editStep();
    case "delete":
      return deleteStep();
    case "glob":
      return searchStep("files", query || path || undefined);
    case "ls":
      return searchStep("files", path || undefined);
    case "grep":
    case "semSearch":
      return searchStep("code", query || path || undefined);
    case "shell":
      return bashStep(command);
    case "task":
      return subtaskStep(pickString(["description", "prompt"]) || undefined);
    case "createPlan":
    case "updateTodos":
      return todosStep();
    case "mcp":
      return mcpStep();
  }

  const tool = name.toLowerCase();
  if (tool.includes("read")) {
    return fileStep("read", "Reading file...", rawPath);
  }
  if (tool.includes("write") || tool.includes("create")) {
    return fileStep("write", "Creating file...", rawPath);
  }
  if (
    tool.includes("edit") ||
    tool.includes("patch") ||
    tool.includes("apply") ||
    tool.includes("replace")
  ) {
    return editStep();
  }
  if (tool.includes("delete") || tool.includes("remove")) {
    return deleteStep();
  }
  if (tool.includes("glob") || tool.includes("list")) {
    return searchStep("files", query || path || undefined);
  }
  if (tool.includes("grep") || tool.includes("search")) {
    return searchStep(
      tool.includes("file") ? "files" : "code",
      query || path || undefined,
    );
  }
  if (
    tool.includes("bash") ||
    tool.includes("shell") ||
    tool.includes("exec") ||
    tool.includes("command") ||
    tool.includes("terminal")
  ) {
    return bashStep(command);
  }
  if (
    tool.includes("webfetch") ||
    tool.includes("web_fetch") ||
    (tool.includes("fetch") && !tool.includes("search"))
  ) {
    return webStep("fetch", query || undefined);
  }
  if (tool.includes("websearch") || tool.includes("web_search")) {
    return webStep("search", query || undefined);
  }
  if (tool.includes("todo") || tool.includes("plan")) {
    return todosStep();
  }
  if (tool.includes("mcp")) {
    return mcpStep();
  }
  return toolStep("Using " + (name || "tool") + "...");
}

/** Converts a Claude tool call into a UI progress step object. */
export function toolCallToStep(name: string, input: JsonObject): ProgressStep {
  const rawPath = stringOrUndefined(input.file_path) ?? "";
  switch (name) {
    case "Read":
      return fileStep("read", "Reading file...", rawPath);
    case "Glob":
      return searchStep("files", stringOrUndefined(input.pattern));
    case "Grep":
      return searchStep("code", stringOrUndefined(input.pattern));
    case "Write": {
      const content = stringOrUndefined(input.content);
      return fileStep("write", "Creating file...", rawPath, {
        contentPreview: content ? capContentPreview(content) : undefined,
      });
    }
    case "Edit":
      return fileStep("edit", "Editing file...", rawPath, {
        edits: extractClaudeEdits(input),
      });
    case "Bash":
    case "bash":
      return bashStep(
        stringOrUndefined(input.command) ?? "",
        input.run_in_background === true
          ? "Running in background..."
          : "Running command...",
      );
    case "KillShell":
      return bashStep(
        "",
        "Stopping background process...",
        stringOrUndefined(input.shell_id) ?? stringOrUndefined(input.shellId),
      );
    case "Skill":
      return toolStep("Using Skill...", stringOrUndefined(input.skill));
    case "WebFetch":
      return webStep("fetch", stringOrUndefined(input.url));
    case "WebSearch":
      return webStep("search", stringOrUndefined(input.query));
    case "NotebookEdit": {
      const notebookPath = stringOrUndefined(input.notebook_path);
      return {
        type: "notebook",
        label: "Editing notebook...",
        detail:
          notebookPath !== undefined ? shortenPath(notebookPath) : undefined,
        path: notebookPath,
        status: "active",
      };
    }
    // Subagent spawn. Named `Agent` since claude-code v2.1.63; older CLIs emit
    // `Task`. Match both so subagent runs are always recognised (a bare `Task`
    // previously fell through to the generic "Using Task..." row).
    case "Agent":
    case "Task":
      return subtaskStep(
        stringOrUndefined(input.description) ??
          stringOrUndefined(input.subagent_type),
      );
    case "TodoWrite":
      return todosStep();
    case "TodoRead":
      return toolStep("Reading tasks...");
    case "AskUserQuestion": {
      const questions = parseQuestionInput(input);
      return {
        type: "question",
        label: "Asking a question...",
        detail: questions ? questions[0].question : undefined,
        questions,
        status: "active",
      };
    }
    default:
      return toolStep("Using " + name + "...");
  }
}

function getCodexFieldValue(item: JsonObject, keys: string[]): string {
  const sources: JsonObject[] = [item];
  if (
    item.input &&
    typeof item.input === "object" &&
    !Array.isArray(item.input)
  ) {
    sources.push(item.input);
  }
  for (const source of sources) {
    for (const key of keys) {
      if (typeof source[key] === "string" && source[key].trim()) {
        return source[key].trim();
      }
    }
  }
  return "";
}

export function getCodexThreadId(event: JsonObject): string {
  if (typeof event.thread_id === "string" && event.thread_id.trim()) {
    return event.thread_id.trim();
  }
  if (
    event.thread &&
    typeof event.thread === "object" &&
    !Array.isArray(event.thread) &&
    typeof event.thread.id === "string" &&
    event.thread.id.trim()
  ) {
    return event.thread.id.trim();
  }
  return "";
}

export function getCodexAgentMessageText(item: JsonObject): string {
  if (item.type !== "agent_message" && item.type !== "agentMessage") {
    return "";
  }
  if (typeof item.text === "string" && item.text) {
    return item.text;
  }
  if (!Array.isArray(item.content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of item.content) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    if (typeof block.text === "string" && block.text) {
      parts.push(block.text);
      continue;
    }
    if (typeof block.content === "string" && block.content) {
      parts.push(block.content);
    }
  }
  return parts.join("");
}

export function codexItemToStep(item: JsonObject): ProgressStep {
  const itemType =
    item && typeof item.type === "string" && item.type.trim()
      ? item.type.trim()
      : "tool";
  const normalizedType = itemType.toLowerCase();
  const pathValue = getCodexFieldValue(item, [
    "file_path",
    "path",
    "target_file",
    "target_path",
    "notebook_path",
  ]);
  const queryValue = getCodexFieldValue(item, ["query", "pattern", "url"]);
  const commandValue = getCodexFieldValue(item, ["command", "cmd"]);
  const descriptionValue = getCodexFieldValue(item, [
    "description",
    "name",
    "tool",
    "skill",
  ]);
  const normalizedDescription = descriptionValue.toLowerCase();
  const pathDetail = pathValue ? shortenPath(pathValue) : "";
  const itemId =
    typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined;

  const withId = (step: ProgressStep): ProgressStep => {
    if (itemId) step.toolUseId = itemId;
    return step;
  };

  if (
    normalizedType.includes("file_change") ||
    normalizedType === "filechange"
  ) {
    const files = extractFilePaths(item);
    return withId(
      fileStep("edit", "Editing file...", files[0] || pathValue, {
        files: files.length > 0 ? files : undefined,
      }),
    );
  }

  // Codex MCP calls keep their own labels (read/search sub-cases).
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
      return withId(searchStep("code", descriptionValue || undefined));
    }
    return withId(toolStep("Using MCP...", descriptionValue || undefined));
  }

  if (normalizedType.includes("web")) {
    return withId(
      webStep(
        normalizedType.includes("search") ? "search" : "fetch",
        queryValue || pathDetail || undefined,
      ),
    );
  }
  if (normalizedType.includes("read")) {
    return withId(fileStep("read", "Reading file...", pathValue));
  }
  if (normalizedType.includes("grep") || normalizedType.includes("search")) {
    return withId(
      searchStep(
        normalizedType.includes("file") ? "files" : "code",
        queryValue || pathDetail || undefined,
      ),
    );
  }
  if (normalizedType.includes("glob") || normalizedType.includes("list")) {
    return withId(searchStep("files", queryValue || pathDetail || undefined));
  }
  if (normalizedType.includes("write") || normalizedType.includes("create")) {
    return withId(fileStep("write", "Creating file...", pathValue));
  }
  if (
    normalizedType.includes("edit") ||
    normalizedType.includes("patch") ||
    normalizedType.includes("apply")
  ) {
    return withId(fileStep("edit", "Editing file...", pathValue));
  }
  if (
    normalizedType.includes("command") ||
    normalizedType.includes("shell") ||
    normalizedType.includes("bash") ||
    normalizedType.includes("exec")
  ) {
    return withId(bashStep(commandValue, undefined, descriptionValue));
  }
  if (normalizedType.includes("agent") || normalizedType === "collabtoolcall") {
    return withId(subtaskStep(descriptionValue || undefined));
  }
  return withId(
    toolStep(
      "Using " + itemType + "...",
      descriptionValue || pathDetail || queryValue || undefined,
    ),
  );
}
