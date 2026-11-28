import { isUiImplementationTask } from "@eva/shared/uiTaskPrompt";

export const UI_LOCATE_STEP = `1. **Locate the UI (required before editing):** Before changing any file, find the exact control the task refers to.
   - If the description includes **Route**, **Control**, or **Acceptance**, treat those as authoritative.
   - Grep for the visible label text (e.g. "Profile type") in routes/pages under the app — not just internal field names like \`profileType\`.
   - Distinguish similar controls: list-page filters vs edit modals vs create forms often share labels but live in different files.
   - Name each candidate file and why it matches or does not. Only then edit the file that renders the control on the stated route.
   - Do NOT change unrelated Selects/dropdowns that share a similar field name elsewhere.`;

export function detectUiImplementationTask(task: {
  title: string;
  description?: string;
}): boolean {
  return isUiImplementationTask(task);
}

export function buildImplementationSteps(
  typecheckCommand: string,
  commitMessage: string,
  branchName: string,
  uiTask: boolean,
): string {
  const readStep = uiTask ? "2" : "1";
  const implementStep = uiTask ? "3" : "2";
  const typecheckStep = uiTask ? "4" : "3";
  const commitStep = uiTask ? "5" : "4";
  const pushStep = uiTask ? "6" : "5";

  const locateBlock = uiTask ? `${UI_LOCATE_STEP}\n` : "";

  return `${locateBlock}${readStep}. Read the files you plan to modify before editing them — understand existing code first
${implementStep}. Implement changes by editing source code files
${typecheckStep}. Run \`${typecheckCommand}\` to verify no type errors. If errors occur, read the error output carefully, fix every issue, and re-run. Repeat until it passes (max 3 attempts). Type checking MUST pass before you commit — type errors cause deployment failures. Do NOT run a full build command (\`pnpm build\`, \`npm run build\`) — it uses too much memory.
${commitStep}. Run: git add -A -- ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.gif' ':!*.webp' ':!*.webm' ':!*.mp4' ':!*.mov' ':!screenshots/' ':!recordings/' && git commit -m "${commitMessage}"
${pushStep}. Do NOT push. The platform publishes branch "${branchName}" after you finish successfully.`;
}

export function buildSummarySection(uiTask: boolean): string {
  const uiRules = `- One bullet MUST name the route and the specific control you changed (e.g. "/domcare/users-may — Profile type filter scrollbar always visible").
- Do NOT claim "No user-facing routes changed" if you edited any file under app/, pages/, components/, or routes/.`;

  const defaultRules = `- If user-facing routes changed, one bullet naming them (e.g. "/settings/billing — manage billing"). If none (backend-only, schema, cron, etc.), one bullet: "No user-facing routes changed."`;

  return `## Summary (REQUIRED):
After committing, output 3–5 bullet lines for a non-technical reader (plain text, each line starting with "- "). Max ~12 words per line. Outcomes only — no headings, code, jargon, file paths, or function names. Say what users can do differently, not how it was built.
${uiTask ? uiRules : defaultRules}`;
}
