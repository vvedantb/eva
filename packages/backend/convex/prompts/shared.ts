import { PERSONALISATION_PRESETS } from "../validators";

/** Builds the custom instructions block from a user's role preset and custom instructions. */
export function buildCustomInstructionsBlock(
  role: "business" | "dev" | "designer" | undefined,
  customInstructions: string | undefined,
): string {
  const parts: string[] = [];

  if (role && role in PERSONALISATION_PRESETS) {
    parts.push(PERSONALISATION_PRESETS[role].prompt);
  }
  if (customInstructions) {
    parts.push(customInstructions);
  }

  if (parts.length === 0) return "";
  return `\n\n## Custom Instructions\n${parts.join("\n\n")}`;
}

/** Builds the per-app system prompt block, appended to every quick task and session run for that app. */
export function buildSystemPromptBlock(
  systemPrompt: string | undefined,
): string {
  if (!systemPrompt || !systemPrompt.trim()) return "";
  return `\n\n## System Prompt\n${systemPrompt}`;
}

/** Lists sibling repositories the sandbox's git credentials can read; empty when there are none. */
export function buildReadableReposBlock(
  repos: ReadonlyArray<{ owner: string; name: string }>,
): string {
  const [first] = repos;
  if (first === undefined) return "";
  const list = repos.map((repo) => `${repo.owner}/${repo.name}`).join(", ");
  return `\n\n## Other repositories you may read
Your git credentials can also read these repositories (clone/fetch only, no push): ${list}.
Clone one under /tmp when a task needs its code, e.g. \`git clone https://github.com/${first.owner}/${first.name}.git /tmp/${first.name}\`. \`gh\` cannot see them; use git.`;
}

/** Builds an instruction string directing the agent to work inside a specific root directory. */
export function buildRootDirectoryInstruction(rootDirectory: string): string {
  if (!rootDirectory) return "";
  return `\nIMPORTANT: Unless the user mentions otherwise, all changes must be made inside the app at "${rootDirectory}".`;
}

/** Reply-length constraint appended to every session turn prompt. */
export const RESPONSE_LENGTH_INSTRUCTION =
  "\n\nResponse length: Hyper-concise — 1–3 short bullet lines max. Outcomes only; no process, paths, jargon, or code.";
