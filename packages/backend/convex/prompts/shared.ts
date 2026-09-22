import { PERSONALISATION_PRESETS } from "../validators";
import { primaryLinkPath } from "../_sandbox_runtime/workspaceLayout";

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

/**
 * Monorepo scope: which app this session/task is for. A default, not a write
 * fence — shared packages and backend stay in scope when the change belongs
 * there. Sibling apps under `apps/` stay out unless the user asks.
 */
export function buildRootDirectoryInstruction(rootDirectory: string): string {
  if (!rootDirectory) return "";
  return `\nMonorepo: this session is for "${rootDirectory}". Start there. Change shared packages and backend when the task needs them. Leave other apps alone unless asked.`;
}

/** Reply-length constraint appended to every session turn prompt. */
export const RESPONSE_LENGTH_INSTRUCTION =
  "\n\nResponse length: Hyper-concise — 1–3 short bullet lines max. Outcomes only; no process, paths, jargon, or code.";

/**
 * Nudge towards `render_ui`. Appended to the shared chat-turn prompt, so
 * sessions, quick tasks and project chat all get it — the tool is available on
 * every sandbox token, and without a prompt line agents never reach for it.
 */
export const CHAT_UI_INSTRUCTION = `

Interactive panels (optional): when a result is mostly numbers, a checklist, a comparison table, or a closed question, call the eva MCP tool \`render_ui\` instead of writing it out. You supply the content blocks, Eva lays them out, and a button with \`reply\` lets the user answer in one tap. One panel per reply at most, and keep your own reply as short as ever.`;

/** One linked repo, as the prompt needs to describe it to the agent. */
export type LinkedRepoPromptRow = {
  owner: string;
  name: string;
  path: string;
  branchName: string;
  baseBranch: string;
};

/**
 * Builds the "Linked repositories" prompt block for a multi-repo session.
 * Empty string for an ordinary single-repo session (no `linkedRepos`) — every
 * other prompt section stays byte-identical to before multi-repo sessions
 * existed.
 */
export function buildLinkedReposSection(
  primary: { owner: string; name: string; branchName: string },
  linkedRepos: LinkedRepoPromptRow[],
  commitMessage: string,
): string {
  if (linkedRepos.length === 0) return "";
  const primaryLine = `- ${primary.owner}/${primary.name}   ${primaryLinkPath(primary.name)}   (primary, your cwd)   branch ${primary.branchName}`;
  const linkedLines = linkedRepos.map(
    (repo) =>
      `- ${repo.owner}/${repo.name}   ${repo.path}   branch ${repo.branchName}   base ${repo.baseBranch}`,
  );
  return `

## Linked repositories
This session spans several repos. All are checked out under /tmp/workspace:
${[primaryLine, ...linkedLines].join("\n")}
Commit in each repo you change: cd <path> && git add -A -- ':!*.png' ':!*.jpg' ':!recordings/' ':!plan.md' && git diff --cached --quiet || git commit -m "task: ${commitMessage}".
Before running a linked repo's commands, load its env: cd <path> && set -a && . ./.env.eva && set +a (the file is absent when the repo has no Eva env vars).
Never push. Eva pushes every repo that has new commits and opens one PR per repo after the turn.
Keep plan.md, screenshots/ and recordings/ in /tmp/repo.`;
}
