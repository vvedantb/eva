---
name: audit
description: "Run a read-only code audit against a path, a PR, a diff or the whole repo, then (on request) fix the findings in small split PRs. Modes: single source of truth (duplicated facts and state with two owners), implicit state machines (lifecycles spread across flags, unguarded status writes, stale async writes), domain model (edge cases a better data shape would remove), architecture (shallow modules). Use when the user asks for an audit, a 'single source of truth audit', to 'find implicit state machines', check the domain model, hunt drift, duplication, race conditions or stuck states, or to audit a PR or diff for these."
---

# Audit

One method, several lenses. Each lens is a file in `modes/`. The method below is shared: scope, search, verify, report, decide, fix, prove.

Read-only until the user asks for fixes.

## 0. Parse the request

| Input | Target |
|---|---|
| A path (`apps/web/src/lib/chat`) | That folder |
| A PR number or URL | `gh pr diff <n>` plus the files it touches |
| `--diff <ref>` (default `origin/main`) | `git diff <ref>...HEAD` plus the files it touches |
| Nothing | The whole repo; split by layer |

| Mode | File | Ask it as |
|---|---|---|
| `ssot` | `modes/single-source-of-truth.md` | "single source of truth audit", "find drift / duplication" |
| `state-machines` | `modes/implicit-state-machines.md` | "find all implicit state machines", "race conditions", "stuck states" |
| `domain-model` | `modes/domain-model.md` | "model the domain", "remove edge cases", "too many branches" |
| `architecture` | the `improve-codebase-architecture` skill | "deepen modules", "improve architecture" |
| `all` | every mode above | "full audit" |

If the mode is unclear, ask once with these options. For a diff or PR target, report only findings the diff adds or touches, plus existing copies the diff should have reused.

## 1. Search in parallel

- Split by layer (backend / shared / web) or by mode, one read-only Explore subagent each. Run them in the background, in one message.
- Brief each one: the target, the mode file's signals, what is out of scope (generated files, vendored code, other apps), and "file:line evidence for every claim; at most ~20 findings ranked by severity; skip false positives".
- Do not search the same area yourself while they run.

## 2. Verify before reporting

Searchers misread line numbers and miss guards in helpers. Before you report:

1. Read the code for the top findings yourself (at least every "high").
2. For each, confirm the exact sites, and that no guard, test or comment already makes it intended.
3. Mark what you verified and what you did not. Never call a race reproduced unless you ran it.

A wrong finding costs trust. In past runs a claimed bug was already handled; say so and drop it.

## 3. Report

- One line per finding at the top: what, where, why it matters. Group by severity: **already drifted / reachable bug** → **likely to drift** → **cosmetic**.
- Each finding: every `file:line` owner, the concrete bad sequence or the copies that differ, the proposed single owner or fix, severity.
- End with the decisions only the user can make (which label wins, which layer owns a value, visible behaviour changes) as concrete options, and a proposed split into PRs.
- Visuals beat prose for large results: a table for the top 10, `render_ui` / `render_html` when the host supports it.

Stop here unless the user asked for fixes.

## 4. Decide

Ask the user's decisions in one `AskUserQuestion` (up to 4 questions, recommended option first). Typical ones:

- Which of two drifted values is right (a label, a limit, a colour).
- Which layer owns shared state (server per item, URL, local only).
- Whether a behaviour change on one surface should spread to the others.

Log the decisions in the chat log, then fix.

## 5. Fix in split PRs

Follow `fix-in-split-prs.md`. Short form:

- One PR per area, each branched from `origin/main`, each mergeable alone. About 40 files max; split again if larger.
- Each fix agent gets the shared brief plus its scope list, and is told which nearby lines belong to sibling PRs.
- Heavy commands (install, typecheck) run under one `flock` so parallel agents do not run the VM out of memory.

## 6. Prove the set

1. Merge every PR branch into a throwaway integration branch, in the intended order. Resolve conflicts there; note each one.
2. Typecheck the integration branch (all touched packages).
3. If a dev server exists, check out the integration commit in the served checkout, smoke-test the touched pages, and compare against `origin/main` before blaming a PR for a crash. Switch back afterwards.
4. Report: PR list, merge order, expected conflicts and how to resolve each, what was and was not tested, every visible change (flag the ones you chose).

## Pitfalls seen in practice

- Worktrees created inside the repo (`.claude/worktrees/`) get swept into commits by turn-end checkpoints. Remove them (`git worktree remove`) before the turn ends, and drop any gitlinks they left.
- Generated files (Convex `_generated/api.d.ts`) drift when you switch the served checkout; restore them before switching back.
- The dev server serves one checkout. Fix agents in worktrees cannot verify in the running app; say so.
- Tightening a guard can break a caller that relied on the loose rule. Grep every caller first.
- A copy that is "the same fact" sometimes intentionally differs (UI label vs LLM prompt text). Keep both values co-located rather than unify the text, and ask.
- Do not edit vendored skills (`skills-lock.json` entries); they are overwritten on update.
