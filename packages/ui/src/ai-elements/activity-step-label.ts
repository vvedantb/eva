import type { ActivityStep } from "./activity-shared";

export type CommandVisualKind = "inspect" | "git" | "terminal";

export interface StepRowPresentation {
  text: string;
  fileChip?: { name: string; path?: string };
  title?: string;
}

const READ_FILE_COMMAND_TOOLS = new Set([
  "cat",
  "nl",
  "head",
  "tail",
  "sed",
  "less",
  "more",
]);
const SEARCH_COMMAND_TOOLS = new Set(["rg", "grep", "ag", "ack"]);
const FIND_COMMAND_TOOLS = new Set(["find", "fd"]);
const LIST_COMMAND_TOOLS = new Set(["ls"]);

function isInspectCommandTool(tool: string): boolean {
  return (
    READ_FILE_COMMAND_TOOLS.has(tool) ||
    SEARCH_COMMAND_TOOLS.has(tool) ||
    FIND_COMMAND_TOOLS.has(tool) ||
    LIST_COMMAND_TOOLS.has(tool)
  );
}

function basename(value: string): string {
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return slash >= 0 ? value.slice(slash + 1) : value;
}

function truncatePattern(value: string, max = 30): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function compactPath(path: string): string {
  if (path === ".") {
    return "current directory";
  }
  if (path === "..") {
    return "parent directory";
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return path;
  }
  return parts.slice(-2).join("/");
}

function compactInlineCommand(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137).trimEnd()}...`;
}

function tokenizeCommandArgs(args: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < args.length) {
    while (args[index] === " ") {
      index += 1;
    }
    if (index >= args.length) {
      break;
    }

    const quote = args[index];
    if (quote === '"' || quote === "'") {
      index += 1;
      let token = "";
      while (index < args.length && args[index] !== quote) {
        if (args[index] === "\\" && index + 1 < args.length) {
          token += args[index + 1];
          index += 2;
          continue;
        }
        token += args[index];
        index += 1;
      }
      if (args[index] === quote) {
        index += 1;
      }
      tokens.push(token);
      continue;
    }

    let token = "";
    while (index < args.length && args[index] !== " ") {
      token += args[index];
      index += 1;
    }
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

function splitToolAndArgs(command: string): [tool: string, args: string] {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return ["", ""];
  }
  const separator = normalized.indexOf(" ");
  if (separator === -1) {
    return [basename(normalized).toLowerCase(), ""];
  }
  const tool = basename(normalized.slice(0, separator)).toLowerCase();
  const args = normalized.slice(separator + 1).trim();
  return [tool, args];
}

function findShellChain(
  value: string,
): { operatorStart: number; commandStart: number } | null {
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length - 1; index += 1) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    const next = value[index + 1];
    if (char === "&" && next === "&") {
      return { operatorStart: index, commandStart: index + 2 };
    }
    if (char === ";") {
      return { operatorStart: index, commandStart: index + 1 };
    }
  }

  return null;
}

function isShellSetupPreamble(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  if (/^(?:builtin\s+)?cd\s+/.test(normalized)) {
    return true;
  }
  if (/^(?:source|\.)\s+/.test(normalized)) {
    return true;
  }
  if (/^set\s+[-+][A-Za-z]/.test(normalized)) {
    return true;
  }
  if (
    /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=[^\s]+(?:\s+[A-Za-z_][A-Za-z0-9_]*=[^\s]+)*$/.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}

function stripLeadingShellPreambles(value: string): string {
  let current = value.trim();
  for (let attempts = 0; attempts < 4; attempts += 1) {
    const chain = findShellChain(current);
    if (!chain) {
      return current;
    }
    const head = current.slice(0, chain.operatorStart).trim();
    if (!isShellSetupPreamble(head)) {
      return current;
    }
    current = current.slice(chain.commandStart).trim();
  }
  return current;
}

function unwrapShellCommandIfPresent(rawCommand: string): string {
  let value = rawCommand.trim();
  if (!value) {
    return value;
  }

  const shellPrefixes = [
    "/usr/bin/bash -lc ",
    "/usr/bin/bash -c ",
    "/bin/bash -lc ",
    "/bin/bash -c ",
    "/usr/bin/zsh -lc ",
    "/usr/bin/zsh -c ",
    "/bin/zsh -lc ",
    "/bin/zsh -c ",
    "/bin/sh -lc ",
    "/bin/sh -c ",
    "bash -lc ",
    "bash -c ",
    "zsh -lc ",
    "zsh -c ",
    "sh -lc ",
    "sh -c ",
  ];

  const lowered = value.toLowerCase();
  for (const prefix of shellPrefixes) {
    if (!lowered.startsWith(prefix)) {
      continue;
    }
    value = value.slice(prefix.length).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).trim();
    }
    value = stripLeadingShellPreambles(value);
    break;
  }

  const pipeIndex = value.search(/\s*\|\s*/);
  if (pipeIndex > 0) {
    value = value.slice(0, pipeIndex).trim();
  }

  return value;
}

function stripEnvCommand(args: string): string | null {
  const tokens = tokenizeCommandArgs(args);
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }
    if (token === "--") {
      index += 1;
      break;
    }
    if (
      token === "-u" ||
      token === "--unset" ||
      token === "-C" ||
      token === "--chdir"
    ) {
      index += 2;
      continue;
    }
    if (token.startsWith("--unset=") || token.startsWith("--chdir=")) {
      index += 1;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      index += 1;
      continue;
    }
    break;
  }
  return index < tokens.length ? tokens.slice(index).join(" ") : null;
}

function stripTimeoutCommand(args: string): string | null {
  const tokens = tokenizeCommandArgs(args);
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined || !token.startsWith("-")) {
      break;
    }
    index += token === "-s" || token === "-k" ? 2 : 1;
  }
  const duration = tokens[index];
  if (duration !== undefined && /^\d+(?:\.\d+)?[smhd]?$/.test(duration)) {
    index += 1;
  }
  return index < tokens.length ? tokens.slice(index).join(" ") : null;
}

function stripNiceCommand(args: string): string | null {
  const tokens = tokenizeCommandArgs(args);
  let index = 0;
  if (tokens[index] === "-n") {
    index += 2;
  } else {
    while (tokens[index]?.startsWith("-")) {
      index += 1;
    }
  }
  return index < tokens.length ? tokens.slice(index).join(" ") : null;
}

function stripArchCommand(args: string): string | null {
  const tokens = tokenizeCommandArgs(args);
  let index = 0;
  while (tokens[index]?.startsWith("-")) {
    index += 1;
  }
  return index < tokens.length ? tokens.slice(index).join(" ") : null;
}

function stripCommandDisplayWrappers(command: string): string {
  let current = command.replace(/\s+/g, " ").trim();
  for (let attempts = 0; attempts < 4; attempts += 1) {
    const [tool, args] = splitToolAndArgs(current);
    const next =
      tool === "env"
        ? stripEnvCommand(args)
        : tool === "timeout" || tool === "gtimeout"
          ? stripTimeoutCommand(args)
          : tool === "nice"
            ? stripNiceCommand(args)
            : tool === "arch"
              ? stripArchCommand(args)
              : tool === "command"
                ? args
                : null;
    if (!next || next === current) {
      return current;
    }
    current = next.trim();
  }
  return current;
}

function firstShellCommandSegment(command: string): string {
  const chain = findShellChain(command);
  return chain ? command.slice(0, chain.operatorStart).trim() : command;
}

function lastPathComponents(args: string, fallback: string): string {
  const tokens = tokenizeCommandArgs(args);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    const cleaned = token.replace(/^['"]|['"]$/g, "");
    if (!cleaned || cleaned.startsWith("-")) {
      continue;
    }
    return compactPath(cleaned);
  }
  return fallback;
}

function findTarget(args: string, fallback: string): string {
  const tokens = tokenizeCommandArgs(args);
  let skipNext = false;
  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith("-")) {
      if (
        token === "-maxdepth" ||
        token === "-mindepth" ||
        token === "-name" ||
        token === "-type" ||
        token === "-path"
      ) {
        skipNext = true;
      }
      continue;
    }
    return compactPath(token);
  }
  return fallback;
}

function normalizeSearchPatternToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    return null;
  }
  if (!/[a-z0-9]/i.test(trimmed)) {
    return null;
  }
  return trimmed.length > 30 ? `${trimmed.slice(0, 27)}...` : trimmed;
}

function normalizeSearchPathToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  return compactPath(trimmed);
}

function looksLikeSearchPath(token: string): boolean {
  return token.includes("/") || token.startsWith(".") || token.includes("\\");
}

function extractSearchPatternAndPath(args: string): {
  pattern: string | null;
  path: string | null;
} {
  const tokens = tokenizeCommandArgs(args);
  let pattern: string | null = null;
  let path: string | null = null;
  let skipNext = false;

  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith("-")) {
      if (
        token === "-t" ||
        token === "-g" ||
        token === "--type" ||
        token === "--glob" ||
        token === "--max-count"
      ) {
        skipNext = true;
      }
      continue;
    }
    if (!pattern) {
      const normalizedPattern = normalizeSearchPatternToken(token);
      if (!normalizedPattern) {
        const normalizedPath = normalizeSearchPathToken(token);
        if (normalizedPath && (!path || path === "current directory")) {
          path = normalizedPath;
        }
        continue;
      }
      pattern = normalizedPattern;
      continue;
    }
    if (!path || path === "current directory") {
      path = normalizeSearchPathToken(token) ?? path;
      continue;
    }
  }

  if (pattern && path === "current directory" && looksLikeSearchPath(pattern)) {
    path = normalizeSearchPathToken(pattern);
    pattern = null;
  }

  return { pattern, path };
}

function searchSummary(args: string): string {
  const { pattern, path } = extractSearchPatternAndPath(args);
  if (pattern && path) {
    return `for ${pattern} in ${path}`;
  }
  if (pattern) {
    return `for ${pattern}`;
  }
  if (path) {
    return `in ${path}`;
  }
  return "files";
}

function containsHeredoc(command: string): boolean {
  return /(^|\s)<<-?\s*['"]?[A-Za-z0-9_]+/.test(command);
}

function hasInlineScriptFlag(args: string): boolean {
  const tokens = tokenizeCommandArgs(args);
  return tokens.some(
    (token) => token === "-e" || token === "-c" || token.startsWith("-e="),
  );
}

function inlineScriptTarget(
  tool: string,
  command: string,
  args: string,
): string | null {
  const normalizedTool = tool === "python3" ? "python" : tool;
  if (containsHeredoc(command) || hasInlineScriptFlag(args)) {
    return `${normalizedTool} script`;
  }
  return null;
}

function stripGitGlobalOptions(args: string): string {
  const tokens = tokenizeCommandArgs(args);
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }
    if (
      token === "-C" ||
      token === "-c" ||
      token === "--git-dir" ||
      token === "--work-tree"
    ) {
      index += 2;
      continue;
    }
    if (
      token.startsWith("-C") ||
      token.startsWith("-c") ||
      token.startsWith("--git-dir=") ||
      token.startsWith("--work-tree=")
    ) {
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index).join(" ");
}

function checkoutTarget(args: string): string {
  const tokens = tokenizeCommandArgs(args);
  const branch = tokens.at(-1)?.trim();
  return branch ? branch : "branch";
}

function humanizeGitCommand(
  args: string,
  isRunning: boolean,
): { verb: string; target: string } {
  const normalizedArgs = stripGitGlobalOptions(args);
  const firstToken = normalizedArgs.split(/\s+/, 1)[0];
  const subcommand = firstToken ? firstToken.toLowerCase() : "";
  switch (subcommand) {
    case "status":
      return {
        verb: isRunning ? "Checking" : "Checked",
        target: "git status",
      };
    case "diff":
      return {
        verb: isRunning ? "Comparing" : "Compared",
        target: "changes",
      };
    case "show":
      return {
        verb: isRunning ? "Inspecting" : "Inspected",
        target: "commit",
      };
    case "log":
      return {
        verb: isRunning ? "Reviewing" : "Reviewed",
        target: "git history",
      };
    case "add":
      return {
        verb: isRunning ? "Staging" : "Staged",
        target: "changes",
      };
    case "commit":
      return {
        verb: isRunning ? "Committing" : "Committed",
        target: "changes",
      };
    case "push":
      return {
        verb: isRunning ? "Pushing" : "Pushed",
        target: "to remote",
      };
    case "pull":
      return {
        verb: isRunning ? "Pulling" : "Pulled",
        target: "from remote",
      };
    case "checkout":
    case "switch":
      return {
        verb: isRunning ? "Switching to" : "Switched to",
        target: checkoutTarget(args),
      };
    default:
      return {
        verb: isRunning ? "Running" : "Ran",
        target: compactInlineCommand(`git ${normalizedArgs}`.trim()),
      };
  }
}

export function deriveReadableCommandDisplay(
  rawCommand: string,
  isRunning = false,
): { verb: string; target: string } {
  const command = stripCommandDisplayWrappers(
    unwrapShellCommandIfPresent(rawCommand),
  );
  const primaryCommand = firstShellCommandSegment(command);
  const [tool, args] = splitToolAndArgs(primaryCommand);

  if (READ_FILE_COMMAND_TOOLS.has(tool)) {
    return {
      verb: isRunning ? "Reading" : "Read",
      target: lastPathComponents(args, "file"),
    };
  }
  if (SEARCH_COMMAND_TOOLS.has(tool)) {
    return {
      verb: isRunning ? "Searching" : "Searched",
      target: searchSummary(args),
    };
  }
  if (LIST_COMMAND_TOOLS.has(tool)) {
    return {
      verb: isRunning ? "Listing" : "Listed",
      target: lastPathComponents(args, "directory"),
    };
  }
  if (FIND_COMMAND_TOOLS.has(tool)) {
    return {
      verb: isRunning ? "Finding" : "Found",
      target: findTarget(args, "files"),
    };
  }

  switch (tool) {
    case "mkdir":
      return {
        verb: isRunning ? "Creating" : "Created",
        target: lastPathComponents(args, "directory"),
      };
    case "rm":
      return {
        verb: isRunning ? "Removing" : "Removed",
        target: lastPathComponents(args, "file"),
      };
    case "cp":
    case "mv":
      return {
        verb: isRunning
          ? tool === "cp"
            ? "Copying"
            : "Moving"
          : tool === "cp"
            ? "Copied"
            : "Moved",
        target: lastPathComponents(args, "file"),
      };
    case "git":
      return humanizeGitCommand(args, isRunning);
    case "node":
    case "bun":
    case "deno":
    case "python":
    case "python3":
    case "ruby":
    case "perl":
      return {
        verb: isRunning ? "Running" : "Ran",
        target:
          inlineScriptTarget(tool, command, args) ??
          compactInlineCommand(command),
      };
    case "osascript":
      return {
        verb: isRunning ? "Running" : "Ran",
        target: "AppleScript",
      };
    default:
      return {
        verb: isRunning ? "Running" : "Ran",
        target: compactInlineCommand(command),
      };
  }
}

export function resolveCommandVisualKind(
  rawCommand: string,
): CommandVisualKind {
  const command = stripCommandDisplayWrappers(
    unwrapShellCommandIfPresent(rawCommand),
  );
  const [tool] = splitToolAndArgs(firstShellCommandSegment(command));
  if (isInspectCommandTool(tool)) {
    return "inspect";
  }
  if (tool === "git") {
    return "git";
  }
  return "terminal";
}

function humanizeMcpToken(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === "mcp") return "MCP";
      if (token.toUpperCase() === token && token.length <= 5) return token;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function humanizeMcpToolIdentifier(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("mcp__")) {
    return null;
  }

  const [, server, tool, ...rest] = trimmed.split("__");
  const normalizedServer = humanizeMcpToken(server);
  const normalizedTool = [tool, ...rest]
    .map((part) => humanizeMcpToken(part))
    .filter((part) => part.length > 0)
    .join(" ");

  if (!normalizedServer || !normalizedTool) {
    return null;
  }
  return `${normalizedServer}: ${normalizedTool}`;
}

function getFileVerb(type: ActivityStep["type"], active: boolean): string {
  if (type === "edit" || type === "notebook") {
    return active ? "Editing" : "Edited";
  }
  if (type === "write") {
    return active ? "Creating" : "Created";
  }
  return active ? "Reading" : "Read";
}

function isBackgroundShellLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return normalized.includes("background");
}

function extractMcpIdentifier(step: ActivityStep): string | null {
  const candidates = [step.detail, step.label];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const cleaned = candidate.replace(/\.{3,}$/, "").trim();
    const match = /mcp__[^\s]+/.exec(cleaned);
    if (match) {
      const identifier = match[0].replace(/\.+$/, "");
      return humanizeMcpToolIdentifier(identifier);
    }
    const humanized = humanizeMcpToolIdentifier(cleaned);
    if (humanized) {
      return humanized;
    }
  }
  return null;
}

function isFileChangeTool(step: ActivityStep): boolean {
  const label = step.label.toLowerCase();
  return label.includes("file change") || step.detail === "file_change";
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    const match = /^https?:\/\/([^/?#]+)/i.exec(url);
    return match?.[1] ?? url;
  }
}

function joinCommandText(verb: string, target: string): string {
  if (!target) {
    return verb;
  }
  return `${verb} ${target}`;
}

/**
 * Past-tense phrase used when a step type is folded into a group summary line.
 * Deliberately plural/vague — the exact call is one click away in the fold.
 */
const GROUP_PHRASES: Record<ActivityStep["type"], string> = {
  read: "read files",
  edit: "edited files",
  write: "created files",
  notebook: "edited notebooks",
  bash: "ran commands",
  search_files: "searched for files",
  search_code: "searched the code",
  web_fetch: "fetched pages",
  web_search: "searched the web",
  subtask: "ran agents",
  todos: "updated the task list",
  tool: "used tools",
  notice: "posted notices",
  hook: "ran hooks",
  status: "reported status",
  thinking: "thought it through",
  reasoning: "thought it through",
  response: "replied",
  question: "asked a question",
};

function groupPhraseForStep(step: ActivityStep): string {
  if (step.type !== "tool") {
    return GROUP_PHRASES[step.type];
  }
  // Codex reports edits as a `file_change` tool call, not an edit step.
  if (isFileChangeTool(step)) {
    return GROUP_PHRASES.edit;
  }
  const mcpLabel = extractMcpIdentifier(step);
  const server = mcpLabel?.split(":")[0]?.trim();
  return server ? `used ${server}` : GROUP_PHRASES.tool;
}

/**
 * One-line summary for a folded run of steps — "Edited files, ran commands" —
 * listing each distinct kind of work once, in the order it first happened.
 */
export function deriveActionGroupSummary(steps: ActivityStep[]): string {
  const phrases: string[] = [];
  for (const step of steps) {
    const phrase = groupPhraseForStep(step);
    if (phrase && !phrases.includes(phrase)) {
      phrases.push(phrase);
    }
  }
  const joined = phrases.join(", ");
  if (!joined) {
    return "Worked";
  }
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

export function deriveStepRowPresentation(
  step: ActivityStep,
  isActive: boolean,
): StepRowPresentation {
  switch (step.type) {
    case "read":
    case "edit":
    case "write":
    case "notebook": {
      const filePath = step.path ?? step.detail ?? "";
      const fileName = filePath ? basename(filePath) : step.label;
      return {
        text: getFileVerb(step.type, isActive),
        fileChip: {
          name: fileName,
          path: step.path,
        },
      };
    }
    case "bash": {
      if (!step.detail) {
        return { text: step.label };
      }
      if (isBackgroundShellLabel(step.label)) {
        return {
          text: `${step.label.replace(/\.\.\.$/, "").trim()} ${compactInlineCommand(step.detail)}`.trim(),
        };
      }
      const display = deriveReadableCommandDisplay(step.detail, isActive);
      return { text: joinCommandText(display.verb, display.target) };
    }
    case "search_code": {
      const pattern = step.detail ? truncatePattern(step.detail) : "pattern";
      return {
        text: isActive
          ? `Searching for "${pattern}"`
          : `Searched for "${pattern}"`,
      };
    }
    case "search_files": {
      const pattern = step.detail ? truncatePattern(step.detail) : "pattern";
      return {
        text: isActive
          ? `Finding files matching "${pattern}"`
          : `Found files matching "${pattern}"`,
      };
    }
    case "web_fetch": {
      const url = step.detail ?? "";
      return {
        text: isActive
          ? `Fetching ${url ? extractHostname(url) : "URL"}`
          : `Fetched ${url ? extractHostname(url) : "URL"}`,
        title: url || undefined,
      };
    }
    case "web_search": {
      const query = step.detail ? truncatePattern(step.detail) : "query";
      return {
        text: isActive
          ? `Searching the web for "${query}"`
          : `Searched the web for "${query}"`,
      };
    }
    case "subtask": {
      const description = step.detail ?? step.label;
      return {
        text: isActive
          ? `Running agent: ${description}`
          : `Ran agent: ${description}`,
      };
    }
    case "todos": {
      return {
        text: isActive ? "Updating tasks" : "Task list",
      };
    }
    case "tool": {
      if (isFileChangeTool(step)) {
        return {
          text: isActive ? "Editing files" : "Edited files",
        };
      }
      const mcpLabel = extractMcpIdentifier(step);
      if (mcpLabel) {
        return {
          text: isActive ? `Using ${mcpLabel}` : `Used ${mcpLabel}`,
        };
      }
      return { text: step.label };
    }
    case "question": {
      if (isActive) {
        return { text: "Waiting for your answer" };
      }
      return { text: step.detail ? `Asked: ${step.detail}` : step.label };
    }
    case "thinking":
    case "reasoning":
    case "response":
    default:
      return { text: step.label };
  }
}
