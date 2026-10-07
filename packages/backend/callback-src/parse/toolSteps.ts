import type { JsonObject, ProgressStep } from "../types.js";
import { shortenPath } from "../utils.js";
import { parseQuestionInput } from "./questionInput.js";
import {
  capCommand,
  capContentPreview,
  extractClaudeEdits,
  extractFilePaths,
  pickToolCallId,
} from "./toolResultCapture.js";

/** Converts an opencode tool call event part into a UI progress step object. */
export function opencodeToolToStep(part: JsonObject): ProgressStep {
  const tool = typeof part.tool === "string" ? part.tool : "tool";
  const stateObj =
    part.state && typeof part.state === "object" && !Array.isArray(part.state)
      ? part.state
      : null;
  const input =
    stateObj &&
    "input" in stateObj &&
    stateObj.input &&
    typeof stateObj.input === "object" &&
    !Array.isArray(stateObj.input)
      ? stateObj.input
      : {};
  const rawPath =
    typeof input.filePath === "string"
      ? input.filePath
      : typeof input.file_path === "string"
        ? input.file_path
        : typeof input.path === "string"
          ? input.path
          : "";
  const path = rawPath ? shortenPath(rawPath) : "";
  const toolUseId =
    pickToolCallId(part) ??
    (typeof part.callID === "string" && part.callID.trim()
      ? part.callID.trim()
      : undefined);

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
        detail: typeof input.pattern === "string" ? input.pattern : undefined,
        status: "active",
      };
      break;
    case "grep":
      step = {
        type: "search_code",
        label: "Searching code...",
        detail: typeof input.pattern === "string" ? input.pattern : undefined,
        status: "active",
      };
      break;
    case "write": {
      const content =
        typeof input.content === "string" ? input.content : undefined;
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
      const rawCommand = typeof input.command === "string" ? input.command : "";
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
        detail: typeof input.url === "string" ? input.url : undefined,
        status: "active",
      };
      break;
    case "websearch":
      step = {
        type: "web_search",
        label: "Searching web...",
        detail: typeof input.query === "string" ? input.query : undefined,
        status: "active",
      };
      break;
    case "task":
      step = {
        type: "subtask",
        label: "Running agent...",
        detail:
          typeof input.description === "string" ? input.description : undefined,
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
      const fileText = pickString([
        "fileText",
        "file_text",
        "content",
        "contents",
      ]);
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
      const server = pickString([
        "server",
        "serverName",
        "server_name",
        "toolName",
        "tool_name",
      ]);
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
    const server = pickString([
      "server",
      "serverName",
      "server_name",
      "toolName",
      "tool_name",
    ]);
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
  const rawPath =
    typeof input.file_path === "string" ? String(input.file_path) : "";
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
        detail:
          typeof input.pattern === "string" ? String(input.pattern) : undefined,
        status: "active",
      };
    case "Grep":
      return {
        type: "search_code",
        label: "Searching code...",
        detail:
          typeof input.pattern === "string" ? String(input.pattern) : undefined,
        status: "active",
      };
    case "Write": {
      const content =
        typeof input.content === "string" ? input.content : undefined;
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
      const rawCommand =
        typeof input.command === "string" ? String(input.command) : "";
      return {
        type: "bash",
        label:
          input.run_in_background === true
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
        detail:
          typeof input.shell_id === "string"
            ? String(input.shell_id)
            : typeof input.shellId === "string"
              ? String(input.shellId)
              : undefined,
        status: "active",
      };
    case "Skill":
      return {
        type: "tool",
        label: "Using Skill...",
        detail:
          typeof input.skill === "string" ? String(input.skill) : undefined,
        status: "active",
      };
    case "WebFetch":
      return {
        type: "web_fetch",
        label: "Fetching URL...",
        detail: typeof input.url === "string" ? String(input.url) : undefined,
        status: "active",
      };
    case "WebSearch":
      return {
        type: "web_search",
        label: "Searching web...",
        detail:
          typeof input.query === "string" ? String(input.query) : undefined,
        status: "active",
      };
    case "NotebookEdit":
      return {
        type: "notebook",
        label: "Editing notebook...",
        detail:
          typeof input.notebook_path === "string"
            ? shortenPath(String(input.notebook_path))
            : undefined,
        path:
          typeof input.notebook_path === "string"
            ? String(input.notebook_path)
            : undefined,
        status: "active",
      };
    // Subagent spawn. Named `Agent` since claude-code v2.1.63; older CLIs emit
    // `Task`. Match both so subagent runs are always recognised (a bare `Task`
    // previously fell through to the generic "Using Task..." row).
    case "Agent":
    case "Task":
      return {
        type: "subtask",
        label: "Running agent...",
        detail:
          typeof input.description === "string"
            ? String(input.description)
            : typeof input.subagent_type === "string"
              ? String(input.subagent_type)
              : undefined,
        status: "active",
      };
    case "TodoWrite":
      return { type: "tool", label: "Updating tasks...", status: "active" };
    case "TodoRead":
      return { type: "tool", label: "Reading tasks...", status: "active" };
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
      return {
        type: "tool",
        label: "Using " + name + "...",
        status: "active",
      };
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
  const pathDetail = pathValue ? shortenPath(String(pathValue)) : "";
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
