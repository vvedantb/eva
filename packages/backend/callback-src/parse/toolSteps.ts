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

type ToolStepRule<F> = {
  matches: (tool: string) => boolean;
  toStep: (fields: F, tool: string) => ProgressStep;
};

type CursorToolFields = {
  args: JsonObject;
  rawPath: string;
  path: string;
  command: string;
  query: string;
};

function pickCursorString(args: JsonObject, keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function getCursorToolFields(args: JsonObject): CursorToolFields {
  const rawPath = pickCursorString(args, [
    "path",
    "file_path",
    "filePath",
    "target_file",
    "targetFile",
    "relativePath",
    "relative_path",
  ]);
  return {
    args,
    rawPath,
    path: rawPath ? shortenPath(rawPath) : "",
    command: pickCursorString(args, ["command", "cmd"]),
    query: pickCursorString(args, [
      "query",
      "pattern",
      "url",
      "glob_pattern",
      "globPattern",
    ]),
  };
}

function cursorPathStep(
  type: string,
  label: string,
  fields: CursorToolFields,
): ProgressStep {
  return {
    type,
    label,
    detail: fields.path || undefined,
    path: fields.rawPath || undefined,
    status: "active",
  };
}

function cursorDetailStep(
  type: string,
  label: string,
  detail: string,
): ProgressStep {
  return { type, label, detail: detail || undefined, status: "active" };
}

function cursorShellStep(fields: CursorToolFields): ProgressStep {
  const { command } = fields;
  return {
    type: "bash",
    label: "Running command...",
    detail: command ? command.slice(0, 300) : undefined,
    command: command ? capCommand(command) : undefined,
    status: "active",
  };
}

function cursorTasksStep(): ProgressStep {
  return { type: "tool", label: "Updating tasks...", status: "active" };
}

function cursorMcpStep(fields: CursorToolFields): ProgressStep {
  const server = pickCursorString(fields.args, [
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

function cursorSearchCodeStep(fields: CursorToolFields): ProgressStep {
  return cursorDetailStep(
    "search_code",
    "Searching code...",
    fields.query || fields.path,
  );
}

/** Known Cursor SDK tool kinds, matched by exact name. */
const CURSOR_KNOWN_TOOL_STEPS = new Map<
  string,
  (fields: CursorToolFields) => ProgressStep
>([
  ["read", (f) => cursorPathStep("read", "Reading file...", f)],
  [
    "write",
    (f) => {
      const fileText = pickCursorString(f.args, [
        "fileText",
        "file_text",
        "content",
        "contents",
      ]);
      return {
        type: "write",
        label: "Creating file...",
        detail: f.path || undefined,
        path: f.rawPath || undefined,
        contentPreview: fileText ? capContentPreview(fileText) : undefined,
        status: "active",
      };
    },
  ],
  [
    "edit",
    (f) => ({
      type: "edit",
      label: "Editing file...",
      detail: f.path || undefined,
      path: f.rawPath || undefined,
      edits: extractClaudeEdits(f.args),
      status: "active",
    }),
  ],
  ["delete", (f) => cursorPathStep("edit", "Deleting file...", f)],
  [
    "glob",
    (f) =>
      cursorDetailStep("search_files", "Searching files...", f.query || f.path),
  ],
  ["ls", (f) => cursorDetailStep("search_files", "Searching files...", f.path)],
  ["grep", cursorSearchCodeStep],
  ["semSearch", cursorSearchCodeStep],
  ["shell", cursorShellStep],
  [
    "task",
    (f) =>
      cursorDetailStep(
        "subtask",
        "Running agent...",
        pickCursorString(f.args, ["description", "prompt"]),
      ),
  ],
  ["createPlan", cursorTasksStep],
  ["updateTodos", cursorTasksStep],
  ["mcp", cursorMcpStep],
]);

/** Heuristic fallbacks for renamed/unknown tools, checked in order against the lowercased name. */
const CURSOR_HEURISTIC_TOOL_STEPS: ToolStepRule<CursorToolFields>[] = [
  {
    matches: (tool) => tool.includes("read"),
    toStep: (f) => cursorPathStep("read", "Reading file...", f),
  },
  {
    matches: (tool) => tool.includes("write") || tool.includes("create"),
    toStep: (f) => cursorPathStep("write", "Creating file...", f),
  },
  {
    matches: (tool) =>
      tool.includes("edit") ||
      tool.includes("patch") ||
      tool.includes("apply") ||
      tool.includes("replace"),
    toStep: (f) => ({
      ...cursorPathStep("edit", "Editing file...", f),
      edits: extractClaudeEdits(f.args),
    }),
  },
  {
    matches: (tool) => tool.includes("delete") || tool.includes("remove"),
    toStep: (f) => cursorPathStep("edit", "Deleting file...", f),
  },
  {
    matches: (tool) => tool.includes("glob") || tool.includes("list"),
    toStep: (f) =>
      cursorDetailStep("search_files", "Searching files...", f.query || f.path),
  },
  // Before grep/search: every web-search name also contains "search".
  {
    matches: (tool) =>
      tool.includes("websearch") || tool.includes("web_search"),
    toStep: (f) => cursorDetailStep("web_search", "Searching web...", f.query),
  },
  {
    matches: (tool) => tool.includes("grep") || tool.includes("search"),
    toStep: (f, tool) =>
      cursorDetailStep(
        tool.includes("file") ? "search_files" : "search_code",
        tool.includes("file") ? "Searching files..." : "Searching code...",
        f.query || f.path,
      ),
  },
  {
    matches: (tool) =>
      tool.includes("bash") ||
      tool.includes("shell") ||
      tool.includes("exec") ||
      tool.includes("command") ||
      tool.includes("terminal"),
    toStep: cursorShellStep,
  },
  {
    matches: (tool) =>
      tool.includes("webfetch") ||
      tool.includes("web_fetch") ||
      (tool.includes("fetch") && !tool.includes("search")),
    toStep: (f) => cursorDetailStep("web_fetch", "Fetching URL...", f.query),
  },
  {
    matches: (tool) => tool.includes("todo") || tool.includes("plan"),
    toStep: cursorTasksStep,
  },
  {
    matches: (tool) => tool.includes("mcp"),
    toStep: cursorMcpStep,
  },
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
  const fields = getCursorToolFields(args);
  const known = CURSOR_KNOWN_TOOL_STEPS.get(name);
  if (known) {
    return known(fields);
  }
  const tool = name.toLowerCase();
  const rule = CURSOR_HEURISTIC_TOOL_STEPS.find((r) => r.matches(tool));
  if (rule) {
    return rule.toStep(fields, tool);
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

type CodexItemFields = {
  item: JsonObject;
  itemType: string;
  pathValue: string;
  pathDetail: string;
  queryValue: string;
  commandValue: string;
  descriptionValue: string;
};

function getCodexItemFields(item: JsonObject): CodexItemFields {
  const itemType =
    item && typeof item.type === "string" && item.type.trim()
      ? item.type.trim()
      : "tool";
  const pathValue = getCodexFieldValue(item, [
    "file_path",
    "path",
    "target_file",
    "target_path",
    "notebook_path",
  ]);
  return {
    item,
    itemType,
    pathValue,
    queryValue: getCodexFieldValue(item, ["query", "pattern", "url"]),
    commandValue: getCodexFieldValue(item, ["command", "cmd"]),
    descriptionValue: getCodexFieldValue(item, [
      "description",
      "name",
      "tool",
      "skill",
    ]),
    pathDetail: pathValue ? shortenPath(String(pathValue)) : "",
  };
}

function codexPathStep(
  type: string,
  label: string,
  fields: CodexItemFields,
): ProgressStep {
  return {
    type,
    label,
    detail: fields.pathDetail || undefined,
    path: fields.pathValue || undefined,
    status: "active",
  };
}

function codexDetailStep(
  type: string,
  label: string,
  detail: string,
): ProgressStep {
  return { type, label, detail: detail || undefined, status: "active" };
}

function codexFileChangeStep(fields: CodexItemFields): ProgressStep {
  const files = extractFilePaths(fields.item);
  return {
    type: "edit",
    label: "Editing file...",
    detail: files[0] ? shortenPath(files[0]) : fields.pathDetail || undefined,
    path: files[0] || fields.pathValue || undefined,
    files: files.length > 0 ? files : undefined,
    status: "active",
  };
}

function codexMcpToolStep(fields: CodexItemFields): ProgressStep {
  const { descriptionValue } = fields;
  const normalizedDescription = descriptionValue.toLowerCase();
  if (normalizedDescription.includes("fetch_file")) {
    return codexDetailStep("read", "Reading file...", descriptionValue);
  }
  if (
    normalizedDescription.includes("search") ||
    normalizedDescription.includes("list_repositories") ||
    normalizedDescription.includes("list_mcp_resources")
  ) {
    return codexDetailStep(
      "search_code",
      "Searching code...",
      descriptionValue,
    );
  }
  return codexDetailStep("tool", "Using MCP...", descriptionValue);
}

/** Codex item kinds, checked in order against the lowercased item type. */
const CODEX_ITEM_STEPS: ToolStepRule<CodexItemFields>[] = [
  {
    matches: (type) => type.includes("file_change") || type === "filechange",
    toStep: codexFileChangeStep,
  },
  {
    matches: (type) => type === "mcp_tool_call" || type === "mcptoolcall",
    toStep: codexMcpToolStep,
  },
  {
    matches: (type) => type.includes("web"),
    toStep: (f, type) =>
      codexDetailStep(
        type.includes("search") ? "web_search" : "web_fetch",
        type.includes("search") ? "Searching web..." : "Fetching URL...",
        f.queryValue || f.pathDetail,
      ),
  },
  {
    matches: (type) => type.includes("read"),
    toStep: (f) => codexPathStep("read", "Reading file...", f),
  },
  {
    matches: (type) => type.includes("grep") || type.includes("search"),
    toStep: (f, type) =>
      codexDetailStep(
        type.includes("file") ? "search_files" : "search_code",
        type.includes("file") ? "Searching files..." : "Searching code...",
        f.queryValue || f.pathDetail,
      ),
  },
  {
    matches: (type) => type.includes("glob") || type.includes("list"),
    toStep: (f) =>
      codexDetailStep(
        "search_files",
        "Searching files...",
        f.queryValue || f.pathDetail,
      ),
  },
  {
    matches: (type) => type.includes("write") || type.includes("create"),
    toStep: (f) => codexPathStep("write", "Creating file...", f),
  },
  {
    matches: (type) =>
      type.includes("edit") || type.includes("patch") || type.includes("apply"),
    toStep: (f) => codexPathStep("edit", "Editing file...", f),
  },
  {
    matches: (type) =>
      type.includes("command") ||
      type.includes("shell") ||
      type.includes("bash") ||
      type.includes("exec"),
    toStep: (f) => ({
      type: "bash",
      label: "Running command...",
      detail: f.commandValue || f.descriptionValue || undefined,
      command: f.commandValue ? capCommand(f.commandValue) : undefined,
      status: "active",
    }),
  },
  {
    matches: (type) => type.includes("agent") || type === "collabtoolcall",
    toStep: (f) =>
      codexDetailStep("subtask", "Running agent...", f.descriptionValue),
  },
];

export function codexItemToStep(item: JsonObject): ProgressStep {
  const fields = getCodexItemFields(item);
  const normalizedType = fields.itemType.toLowerCase();
  const itemId =
    typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined;
  const rule = CODEX_ITEM_STEPS.find((r) => r.matches(normalizedType));
  const step: ProgressStep = rule
    ? rule.toStep(fields, normalizedType)
    : {
        type: "tool",
        label: "Using " + fields.itemType + "...",
        detail:
          fields.descriptionValue ||
          fields.pathDetail ||
          fields.queryValue ||
          undefined,
        status: "active",
      };
  if (itemId) step.toolUseId = itemId;
  return step;
}
