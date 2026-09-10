import type { Id } from "../_generated/dataModel";
import {
  buildImplementationSteps,
  buildSummarySection,
  detectUiImplementationTask,
} from "./uiImplementationPrompt";
import {
  buildReadableReposBlock,
  buildRootDirectoryInstruction,
  buildSystemPromptBlock,
} from "../prompts";

export const WORKSPACE_DIR = "/tmp/repo";

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildTypecheckCommand(rootDirectory: string): string {
  const typecheckDirectory = rootDirectory
    ? `${WORKSPACE_DIR}/${rootDirectory}`
    : WORKSPACE_DIR;
  return `cd ${shellSingleQuote(typecheckDirectory)} && { status=0; timeout --kill-after=10s 120s npx tsc --noEmit --pretty false > /tmp/eva-tsc.log 2>&1 || status=$?; tail -50 /tmp/eva-tsc.log; exit "$status"; }`;
}

/** Builds a user-facing notification message for a workflow run completion. */
export function buildWorkflowRunNotificationMessage(params: {
  success: boolean;
  projectId: Id<"projects"> | undefined;
  error: string | null;
  prUrl: string | null;
}): string {
  const scopeLabel = params.projectId ? "project task" : "quick task";
  if (params.success) {
    if (params.prUrl) {
      return `Run succeeded for this ${scopeLabel}. Pull request: ${params.prUrl}`;
    }
    return `Run succeeded for this ${scopeLabel}.`;
  }
  if (params.error) {
    const trimmedError = params.error.trim();
    const clippedError =
      trimmedError.length > 200
        ? `${trimmedError.slice(0, 197)}...`
        : trimmedError;
    return `Run failed for this ${scopeLabel}. ${clippedError}`;
  }
  return `Run failed for this ${scopeLabel}.`;
}

/**
 * A reviewer change request prepared for a re-run prompt.
 * `commitText` is the mention-resolved request used for the edit commit subject;
 * `promptText` is the author/date-annotated version shown to the agent. Keeping
 * them separate stops the `[author · date]` annotation leaking into commits.
 */
export type ChangeRequestPromptInput = {
  commitText: string;
  promptText: string;
};

/** Builds the full implementation prompt sent to the AI agent in the sandbox. */
export function buildImplementationPrompt(
  task: { title: string; description?: string; taskNumber?: number },
  branchName: string,
  isQuickTask: boolean,
  rootDirectory: string,
  _repoOwner: string,
  _repoName: string,
  changeRequests?: ChangeRequestPromptInput[],
  projectContext?: { title: string; description?: string },
  systemPrompt?: string,
  previousRunSummary?: string,
  readableRepos: ReadonlyArray<{ owner: string; name: string }> = [],
): string {
  const commitScope = isQuickTask
    ? "feat"
    : `feat(task-${task.taskNumber ?? task.title})`;
  const latestChangeRequest =
    changeRequests?.[changeRequests.length - 1]?.commitText.trim();
  const editCommitTitle = latestChangeRequest
    ? latestChangeRequest
        .replace(/\s+/g, " ")
        .replace(/"/g, '\\"')
        .slice(0, 120)
    : task.title;
  const commitMessage = changeRequests?.length
    ? `edit: ${editCommitTitle}`
    : `${commitScope}: ${task.title}`;
  const typecheckCommand = buildTypecheckCommand(rootDirectory);
  const uiTask = detectUiImplementationTask({
    title: task.title,
    description: task.description,
  });

  const previousRunSection = previousRunSummary
    ? `\n\n### What the previous run completed:\n${previousRunSummary}`
    : "";
  const changeRequestSection =
    changeRequests && changeRequests.length > 0
      ? `\n## Change Requests (from reviewer):
${changeRequests.map((r, i) => `${i + 1}. ${r.promptText}`).join("\n")}

IMPORTANT: This task was already implemented. The branch "${branchName}" has commits from a previous run. Focus ONLY on addressing the change requests above. Do NOT redo work that was already completed successfully.${previousRunSection}\n`
      : "";

  const projectSection = projectContext
    ? `## Project: ${projectContext.title}${projectContext.description ? `\n${projectContext.description}` : ""}

`
    : "";

  return `You are in IMPLEMENTATION MODE. DIRECTLY edit source code files.

${projectSection}## Task: ${task.title}
## Description: ${task.description || "No description provided"}
${changeRequestSection}

## Steps:
${buildImplementationSteps(typecheckCommand, commitMessage, branchName, uiTask)}

${buildSummarySection(uiTask)}

## Rules:
- Do NOT create .md plan files or run lint/test/dev commands (except typecheck in step 3)
- Do NOT commit or push if typecheck fails. Fix the errors first.
- Do NOT run git push or gh pr commands. Eva handles publishing and PR creation after your successful completion.
- Use lockfile for package manager.
- Prefix shell commands with timeouts: \`timeout 180 npm install\`, \`timeout 30 gh ...\`
- For gh: \`GH_PROMPT_DISABLED=1 timeout 30 gh ...\`
- Do NOT pipe long-running validation commands through \`tail\`; redirect output to a log file, wait for the command to exit, then tail the log.
- NEVER use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`${buildRootDirectoryInstruction(rootDirectory)}${buildSystemPromptBlock(systemPrompt)}${buildReadableReposBlock(readableRepos)}`;
}

/** Builds a prompt for resolving merge conflicts against the base branch. */
export function buildConflictResolutionPrompt(
  branchName: string,
  baseBranch: string,
  rootDirectory: string,
  _repoOwner: string,
  _repoName: string,
  systemPrompt?: string,
): string {
  return `You are resolving merge conflicts. Do NOT re-implement or change any feature — only resolve conflicts and ensure compatibility with the latest base branch.

## Steps:
1. Run: git fetch origin
2. Run: git merge origin/${baseBranch}
3. If there are merge conflicts, resolve them — keep the task branch's implementation intent intact but adapt it to work with the latest base branch changes
4. Run: git add -A -- ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.webp' ':!*.webm' ':!*.mp4' ':!*.mov' ':!screenshots/' ':!recordings/' && git commit -m "fix: resolve merge conflicts with ${baseBranch}"
5. Do NOT push. The platform publishes branch "${branchName}" after you finish successfully.

## Rules:
- Do NOT re-implement or change the feature — only resolve conflicts and ensure compatibility
- Keep the task's implementation intent intact
- Do NOT run git push or gh pr commands. Eva handles publishing and PR creation after your successful completion.
- Use lockfile for package manager.
- Prefix shell commands with \`timeout <seconds>\` (e.g. \`timeout 30 npm install\`)
- NEVER use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`${buildRootDirectoryInstruction(rootDirectory)}${buildSystemPromptBlock(systemPrompt)}`;
}
