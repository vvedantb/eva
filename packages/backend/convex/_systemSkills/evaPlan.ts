import type { SystemSkillHydration } from "./registry";

/**
 * Content served by the `get_skill` MCP tool for `eva-plan`. Replaces the old
 * plan-mode turn prompt: the substance moved here so planning is a skill the
 * agent invokes rather than a session-level mode.
 */
export function buildEvaPlanContent(hydration: SystemSkillHydration): string {
  const rootDirectoryLine = hydration.rootDirectory
    ? `\n- App directory: \`/tmp/repo/${hydration.rootDirectory}\` — plan changes there unless the user says otherwise, but always keep \`plan.md\` at the checkout root.`
    : "";

  return `# eva-plan

Write or revise the implementation plan for this session. Explore first, then leave the plan in \`plan.md\`. Do not implement it in this turn.

## This repo
- Repo: ${hydration.owner}/${hydration.name}
- Base branch: \`${hydration.baseBranch}\`
- Plan file: \`/tmp/repo/plan.md\` (repo checkout root)${rootDirectoryLine}

## Step 1 — Read the current plan
1. \`cat /tmp/repo/plan.md 2>/dev/null || echo "no plan yet"\`

If that shows an existing plan, REVISE it. Keep the parts that still hold, and change only what the user's message asks for. Do not rewrite it from scratch unless the user asks for a fresh plan — the plan accumulates across turns and rewriting it loses agreed decisions.

## Step 2 — Explore the codebase
Use Glob, Grep, and Read to find the files the work actually touches. Read them rather than guessing from names. Check how similar features are already built in this repo and follow those conventions in the plan.

## Step 3 — Write the plan
Write the plan to \`/tmp/repo/plan.md\` covering:

- **Goal** — what the user wants, in one or two sentences.
- **Approach** — the design, and why it beats the obvious alternatives.
- **Files to touch** — concrete paths, with what changes in each.
- **Steps** — ordered, each small enough to verify.
- **Risks and open questions** — anything that could break, plus decisions the user still has to make.

Prefer the simplest approach that works. Name assumptions instead of hiding them. Ask the user about anything genuinely ambiguous rather than picking silently.

## Step 4 — Report
Reply with a short summary of what the plan says and what changed since the last revision. Do not paste the whole plan into chat.

## Rules
- Write \`plan.md\` only. Do not edit source files or implement the plan in this turn.
- Do NOT commit or push \`plan.md\` — Eva reads it from the working tree.
- No build, lint, or test runs unless the user asks.
- Never use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`.
`;
}
