import { buildRootDirectoryInstruction } from "../prompts/shared";
import { READ_ONLY_DELIVERABLE_MARKER } from "./deliverable";

const WORKSPACE_DIR = "/tmp/repo";

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildTypecheckCommand(rootDirectory: string): string {
  const typecheckDirectory = rootDirectory
    ? `${WORKSPACE_DIR}/${rootDirectory}`
    : WORKSPACE_DIR;
  return `cd ${shellSingleQuote(typecheckDirectory)} && { status=0; timeout --kill-after=10s 120s npx tsc --noEmit --pretty false > /tmp/eva-tsc.log 2>&1 || status=$?; tail -50 /tmp/eva-tsc.log; exit "$status"; }`;
}

/** Builds a write-mode prompt for automations that edit code and commit locally. */
export function buildAutomationPrompt(
  title: string,
  description: string,
  branchName: string,
  rootDirectory: string,
): string {
  const typecheckCommand = buildTypecheckCommand(rootDirectory);
  return `You are in IMPLEMENTATION MODE. DIRECTLY edit source code files.

## Automation: ${title}
## Prompt: ${description}

## Steps:
1. Read the files you plan to modify before editing them — understand existing code first
2. Implement changes by editing source code files
3. Run \`${typecheckCommand}\` to verify no type errors. If errors occur, read the output, fix every issue, and re-run (max 3 attempts). Do NOT run a full build (\`pnpm build\`, \`npm run build\`, \`vite build\`) — it exceeds sandbox memory and time limits.
4. Run: git add -A -- ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.webp' ':!*.webm' ':!*.mp4' ':!*.mov' ':!screenshots/' ':!recordings/' && git commit -m "automation: ${title.replace(/"/g, '\\"')}"
5. Do NOT push. Eva publishes branch "${branchName}" after you finish successfully.

## Summary (REQUIRED):
After committing, output 3–5 bullet lines (plain text, each starting with "- "). Max ~12 words per line. Outcomes only — no code, file paths, or implementation detail. This will be added to the PR description.

## Rules:
- Do NOT create .md plan files or run lint/test/dev servers (except typecheck in step 3)
- Do NOT use agent-browser, take screenshots, or record videos
- Do NOT run git push or gh pr commands
- Use lockfile for package manager.
- Prefix shell commands with timeouts: \`timeout 120 npm install\`, \`timeout 30 gh ...\`
- For gh: \`GH_PROMPT_DISABLED=1 timeout 30 gh ...\`
- NEVER use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`
${buildRootDirectoryInstruction(rootDirectory)}`;
}

/** Builds a read-only prompt for automations that analyze the codebase without modifying files. */
export function buildReadOnlyPrompt(
  title: string,
  description: string,
  rootDirectory: string,
): string {
  return `You are in READ-ONLY / REPORT MODE. Do NOT modify any files, do NOT commit, do NOT push, do NOT create branches or PRs.

## Automation: ${title}
## Prompt: ${description}

## Steps:
1. Read and analyze the codebase to answer the prompt
2. You may run read-only commands (e.g. grep, find, cat, ls, git log, git diff, npm test) to gather information
3. Do all reasoning silently — use tools and file reads, not user-visible narration
4. Output the final deliverable after the marker below (see Deliverable section)

## Deliverable (REQUIRED):
Your answer to the Prompt must appear on its own line immediately after this marker. Eva stores and emails ONLY the text after the marker — everything before it is discarded.

${READ_ONLY_DELIVERABLE_MARKER}

Deliverable rules:
- Output only what the Prompt asks for (report, summary, changelog, analysis, etc.)
- No preamble, introduction, date math, methodology, or "here is..." framing
- Follow every formatting rule in the Prompt exactly (headings, bullets, word limits, etc.)
- No code changes

## Rules:
- Do NOT edit, write, or create any files
- Do NOT run git add, git commit, git push, or any git commands that modify state
- Do NOT use agent-browser, take screenshots, or record videos
- Prefix shell commands with timeouts: \`timeout 60 npm test\`
- NEVER use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`
${buildRootDirectoryInstruction(rootDirectory)}`;
}

/** Builds a read-only prompt that produces structured JSON findings for actionable follow-up. */
export function buildActionableReportPrompt(
  title: string,
  description: string,
  rootDirectory: string,
): string {
  return `You are in READ-ONLY / REPORT MODE with STRUCTURED FINDINGS. Do NOT modify any files, do NOT commit, do NOT push, do NOT create branches or PRs.

## Automation: ${title}
## Prompt: ${description}

## Steps:
1. Read and analyze the codebase to answer the prompt
2. You may run read-only commands (e.g. grep, find, cat, ls, git log, git diff, npm test) to gather information
3. Identify discrete, actionable findings
4. Output your findings as structured JSON (see format below)

## Findings Output (REQUIRED):
At the END of your response, output a JSON array of findings inside a fenced code block, preceded by the marker \`<!-- FINDINGS_JSON -->\`.

Each finding must have:
- \`title\`: short summary of the issue (1 line)
- \`description\`: detailed explanation of the issue
- \`severity\`: one of "low", "medium", "high", "critical"
- \`filePaths\`: array of relevant file paths (optional but preferred)
- \`suggestedFix\`: how to fix this issue (optional but preferred)

Example:
<!-- FINDINGS_JSON -->
\`\`\`json
[
  {
    "title": "Unhandled null reference in UserService",
    "description": "The getUserById method does not handle the case where the user is not found, leading to a null reference error.",
    "severity": "high",
    "filePaths": ["src/services/UserService.ts"],
    "suggestedFix": "Add a null check after the database query and return an appropriate error response."
  }
]
\`\`\`

You may include narrative text before the JSON block for context, but the JSON block MUST appear at the end.

## Rules:
- Do NOT edit, write, or create any files
- Do NOT run git add, git commit, git push, or any git commands that modify state
- Do NOT use agent-browser, take screenshots, or record videos
- Prefix shell commands with timeouts: \`timeout 60 npm test\`
- NEVER use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`
${buildRootDirectoryInstruction(rootDirectory)}`;
}
