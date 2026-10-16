import { getAIModelProvider } from "../_validators/aiModels";

/**
 * Claude built-ins whose argument runs to the end of the prompt and must be
 * sent alone. Eva wraps every chat message in context blocks; for `/goal` that
 * context would become part of the goal condition (Claude caps it at 4000
 * characters), and a block placed before the command stops it running at all.
 */
const BARE_CLAUDE_COMMANDS = new Set(["goal"]);

const LEADING_COMMAND = /^\/([a-z][a-z0-9-]*)(?=\s|$)/;

/**
 * The prompt to send verbatim when `message` is a bare-only Claude command on
 * a Claude model, else null (build the normal wrapped prompt).
 */
export function bareHarnessCommandPrompt(
  message: string,
  model: string,
): string | null {
  if (getAIModelProvider(model) !== "claude") return null;
  const trimmed = message.trim();
  const name = LEADING_COMMAND.exec(trimmed)?.[1];
  return name !== undefined && BARE_CLAUDE_COMMANDS.has(name) ? trimmed : null;
}
