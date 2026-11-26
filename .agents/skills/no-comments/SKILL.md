---
name: no-comments
description: "Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints. Use when the user says /no-comments or asks to strip comments from a diff or path."
disable-model-invocation: true
---

# No comments

Adapted from [pstack no-comments](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md).

Spawn Comment Sicko. Act on accepted findings.

Defer to Comment Sicko's fresh perspective.

## Lint rule

`no-comments/no-comments` (`scripts/oxlint/no-comments.mjs`) is an error in `apps/web/src`. Its keep-list is the mechanical form of Comment Sicko's: lint and tool directives (`oxlint-disable`, `@ts-expect-error`, `*-ignore` pragmas), license headers, `/** */` doc comments on exports, and comments with an issue or RFC link.

Mechanical pass for a new path, before the judgment pass: `pnpm no-comments <path>`. Run it twice; the second pass catches fixes that overlapped. Then add the path to the `no-comments/no-comments` override in `.oxlintrc.json`.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

## Steps

1. Spawn the `Agent` tool with `subagent_type: "comment-sicko"`. Pass the scope. Do not restate its rules.
2. Inspect its report and diff. Reject application-code edits, scope escapes, exception-protected deletions, misstated `MUST KILL` reasons, and flags that treat kept intentional code as guilty. Reshape flags on our-code surprises stay actionable. Do not restore those comments. A keep survives only with proof it is about something we cannot change. Audit missed scoped lint and TypeScript suppressions. Correctness or safety suppressions stay actionable `MUST KILL`s. Restore deletions only with exact exceptions and scoped proof. Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, trace their symbol and its git history (`git log -L`). If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail `/no-comments`.
3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, sketch it once for the accepted set and surrounding code. Stop at the sketch. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. The **principle-fix-root-causes** skill guides intent only. It does not authorize widening the fence or fixing instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended runs require caller pre-approval. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.
6. Report the deletion count, restored comments, reruns, sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.
