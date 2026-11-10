import type { JsonObject, JsonValue, ProgressStep } from "../types.js";
import {
  asJsonObject,
  isJsonObject,
  readStringField,
  shortenPath,
  trimmedString,
} from "../utils.js";
import { parseQuestionInput } from "./questionInput.js";
import { STEP_FIELD_CAPS } from "./stepBudget.js";
import {
  capCommand,
  capContentPreview,
  extractClaudeEdits,
  extractFilePaths,
  pickToolCallId,
} from "./toolResultCapture.js";

// Shared step builders. Every mapper below (Claude, Codex, Cursor, OpenCode)
// returns one of these, so a step kind has one shape and one label.

type StepExtra = Partial<Omit<ProgressStep, "type" | "label" | "status">>;

function stringOrUndefined(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** File step: the display detail is the shortened path, `path` the raw one. */
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

/** Bash step: a one-line `detail` capped for the row, the full command capped for `command`. */
function bashStep(
  command: string,
  label = "Running command...",
  fallbackDetail?: string,
): ProgressStep {
  return {
    type: "bash",
    label,
    detail: command
      ? command.slice(0, STEP_FIELD_CAPS.commandDetail)
      : fallbackDetail,
    command: command ? capCommand(command) : undefined,
    status: "active",
  };
}

function searchStep(
  kind: "files" | "code",
  detail: string | undefined,
): ProgressStep {
  return kind === "files"
    ? { type: "search_files", label: "Searching files...", detail, status: "active" }
    : { type: "search_code", label: "Searching code...", detail, status: "active" };
}

function webStep(
  kind: "fetch" | "search",
  detail: string | undefined,
): ProgressStep {
  return kind === "fetch"
    ? { type: "web_fetch", label: "Fetching URL...", detail, status: "active" }
    : { type: "web_search", label: "Searching web...", detail, status: "active" };
}

function subtaskStep(detail: string | undefined): ProgressStep {
  return { type: "subtask", label: "Running agent...", detail, status: "active" };
}

function toolStep(label: string, detail?: string): ProgressStep {
  return { type: "tool", label, detail, status: "active" };
}

function tasksStep(): ProgressStep {
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
      return tasksStep();
    default:
      return toolStep("Using " + tool + "...");
  }
}

/** Converts an opencode tool call event part into a UI progress step object. */
export function opencodeToolToStep(part: JsonObject): ProgressStep {
  const tool = typeof part.tool === "string" ? part.tool : "tool";
  const input = asJsonObject(asJsonObject(part.state).input);
  const rawPath =
    stringOrUndefined(input.filePath) ??
    stringOrUndefined(input.file_path) ??
    stringOrUndefined(input.path) ??
    "";
  const toolUseId = pickToolCallId(part) ?? trimmedString(part.callID);
  const step = opencodeStepFor(tool, input, rawPath);
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

function getCursorToolFields(args: JsonObject): CursorToolFields {
  const rawPath = readStringField(args, [
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
    command: readStringField(args, ["command", "cmd"]),
    query: readStringField(args, [
      "query",
      "pattern",
      "url",
      "glob_pattern",
      "globPattern",
    ]),
  };
}

function cursorShellStep(fields: CursorToolFields): ProgressStep {
  return bashStep(fields.command);
}

function cursorEditStep(fields: CursorToolFields): ProgressStep {
  return fileStep("edit", "Editing file...", fields.rawPath, {
    edits: extractClaudeEdits(fields.args),
  });
}

function cursorDeleteStep(fields: CursorToolFields): ProgressStep {
  return fileStep("edit", "Deleting file...", fields.rawPath);
}

function cursorMcpStep(fields: CursorToolFields): ProgressStep {
  const server = readStringField(fields.args, [
    "server",
    "serverName",
    "server_name",
    "toolName",
    "tool_name",
  ]);
  return toolStep(server ? "Using MCP " + server + "..." : "Using MCP tool...");
}

function cursorSearchCodeStep(fields: CursorToolFields): ProgressStep {
  return searchStep("code", fields.query || fields.path || undefined);
}

/** Known Cursor SDK tool kinds, matched by exact name. */
const CURSOR_KNOWN_TOOL_STEPS = new Map<
  string,
  (fields: CursorToolFields) => ProgressStep
>([
  ["read", (f) => fileStep("read", "Reading file...", f.rawPath)],
  [
    "write",
    (f) => {
      const fileText = readStringField(f.args, [
        "fileText",
        "file_text",
        "content",
        "contents",
      ]);
      return fileStep("write", "Creating file...", f.rawPath, {
        contentPreview: fileText ? capContentPreview(fileText) : undefined,
      });
    },
  ],
  ["edit", cursorEditStep],
  ["delete", cursorDeleteStep],
  ["glob", (f) => searchStep("files", f.query || f.path || undefined)],
  ["ls", (f) => searchStep("files", f.path || undefined)],
  ["grep", cursorSearchCodeStep],
  ["semSearch", cursorSearchCodeStep],
  ["shell", cursorShellStep],
  [
    "task",
    (f) =>
      subtaskStep(readStringField(f.args, ["description", "prompt"]) || undefined),
  ],
  ["createPlan", tasksStep],
  ["updateTodos", tasksStep],
  ["mcp", cursorMcpStep],
]);

/** Heuristic fallbacks for renamed/unknown tools, checked in order against the lowercased name. */
const CURSOR_HEURISTIC_TOOL_STEPS: ToolStepRule<CursorToolFields>[] = [
  {
    matches: (tool) => tool.includes("read"),
    toStep: (f) => fileStep("read", "Reading file...", f.rawPath),
  },
  {
    matches: (tool) => tool.includes("write") || tool.includes("create"),
    toStep: (f) => fileStep("write", "Creating file...", f.rawPath),
  },
  {
    matches: (tool) =>
      tool.includes("edit") ||
      tool.includes("patch") ||
      tool.includes("apply") ||
      tool.includes("replace"),
    toStep: cursorEditStep,
  },
  {
    matches: (tool) => tool.includes("delete") || tool.includes("remove"),
    toStep: cursorDeleteStep,
  },
  {
    matches: (tool) => tool.includes("glob") || tool.includes("list"),
    toStep: (f) => searchStep("files", f.query || f.path || undefined),
  },
  // Before grep/search: every web-search name also contains "search".
  {
    matches: (tool) =>
      tool.includes("websearch") || tool.includes("web_search"),
    toStep: (f) => webStep("search", f.query || undefined),
  },
  {
    matches: (tool) => tool.includes("grep") || tool.includes("search"),
    toStep: (f, tool) =>
      searchStep(
        tool.includes("file") ? "files" : "code",
        f.query || f.path || undefined,
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
    toStep: (f) => webStep("fetch", f.query || undefined),
  },
  {
    matches: (tool) => tool.includes("todo") || tool.includes("plan"),
    toStep: tasksStep,
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
    case "Task": {
      // The prompt the subagent was spawned with: the opening message of its
      // child thread view. Trimmed from the chat transcript query like any
      // other preview, so it costs nothing until a reader opens it.
      const prompt = trimmedString(input.prompt);
      return {
        ...subtaskStep(
          stringOrUndefined(input.description) ??
            stringOrUndefined(input.subagent_type),
        ),
        contentPreview: prompt ? capContentPreview(prompt) : undefined,
      };
    }
    case "TodoWrite":
      return tasksStep();
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
  return (
    readStringField(item, keys).trim() ||
    readStringField(asJsonObject(item.input), keys).trim()
  );
}

export function getCodexThreadId(event: JsonObject): string {
  return (
    trimmedString(event.thread_id) ??
    trimmedString(asJsonObject(event.thread).id) ??
    ""
  );
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
    if (!isJsonObject(block)) continue;
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
  const itemType = trimmedString(item.type) ?? "tool";
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
    pathDetail: pathValue ? shortenPath(pathValue) : "",
  };
}

function codexFileChangeStep(fields: CodexItemFields): ProgressStep {
  const files = extractFilePaths(fields.item);
  return fileStep("edit", "Editing file...", files[0] || fields.pathValue, {
    files: files.length > 0 ? files : undefined,
  });
}

function codexMcpToolStep(fields: CodexItemFields): ProgressStep {
  const { descriptionValue } = fields;
  const normalizedDescription = descriptionValue.toLowerCase();
  // Codex MCP calls keep their own labels: the detail is the tool name, not a path.
  if (normalizedDescription.includes("fetch_file")) {
    return {
      type: "read",
      label: "Reading file...",
      detail: descriptionValue || undefined,
      status: "active",
    };
  }
  if (
    normalizedDescription.includes("search") ||
    normalizedDescription.includes("list_repositories") ||
    normalizedDescription.includes("list_mcp_resources")
  ) {
    return searchStep("code", descriptionValue || undefined);
  }
  return toolStep("Using MCP...", descriptionValue || undefined);
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
      webStep(
        type.includes("search") ? "search" : "fetch",
        f.queryValue || f.pathDetail || undefined,
      ),
  },
  {
    matches: (type) => type.includes("read"),
    toStep: (f) => fileStep("read", "Reading file...", f.pathValue),
  },
  {
    matches: (type) => type.includes("grep") || type.includes("search"),
    toStep: (f, type) =>
      searchStep(
        type.includes("file") ? "files" : "code",
        f.queryValue || f.pathDetail || undefined,
      ),
  },
  {
    matches: (type) => type.includes("glob") || type.includes("list"),
    toStep: (f) =>
      searchStep("files", f.queryValue || f.pathDetail || undefined),
  },
  {
    matches: (type) => type.includes("write") || type.includes("create"),
    toStep: (f) => fileStep("write", "Creating file...", f.pathValue),
  },
  {
    matches: (type) =>
      type.includes("edit") || type.includes("patch") || type.includes("apply"),
    toStep: (f) => fileStep("edit", "Editing file...", f.pathValue),
  },
  {
    matches: (type) =>
      type.includes("command") ||
      type.includes("shell") ||
      type.includes("bash") ||
      type.includes("exec"),
    // The row detail is capped like every other provider's bash step.
    toStep: (f) =>
      bashStep(
        f.commandValue,
        "Running command...",
        f.descriptionValue || undefined,
      ),
  },
  {
    matches: (type) => type.includes("agent") || type === "collabtoolcall",
    toStep: (f) => subtaskStep(f.descriptionValue || undefined),
  },
];

export function codexItemToStep(item: JsonObject): ProgressStep {
  const fields = getCodexItemFields(item);
  const normalizedType = fields.itemType.toLowerCase();
  const itemId = trimmedString(item.id);
  const rule = CODEX_ITEM_STEPS.find((r) => r.matches(normalizedType));
  const step: ProgressStep = rule
    ? rule.toStep(fields, normalizedType)
    : toolStep(
        "Using " + fields.itemType + "...",
        fields.descriptionValue ||
          fields.pathDetail ||
          fields.queryValue ||
          undefined,
      );
  if (itemId) step.toolUseId = itemId;
  return step;
}
