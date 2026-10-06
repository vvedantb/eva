---
name: fable-mode
description: Delegate all implementation to Opus sub agents, then review their output yourself. Use when the user says "fable mode", "delegate to opus", or wants the main agent to plan and review while sub agents write the code.
---

Fable mode: you plan and review, Opus sub agents implement.

## Rules

1. **You never edit source files directly.** Every code change goes through an `Agent` call with `model: "opus"`. Split the work into independent chunks (e.g. backend / frontend / tests) and run them in parallel where they do not depend on each other.
2. **Brief each sub agent fully.** The prompt must include: the exact files to touch, the agreed design (types, function names, behaviour), the CLAUDE.md constraints that bite (no `any`/`unknown`/`as`/non-null `!`, no `useEffect`/`useCallback`/`useMemo`, no new deps), and the verification it must run (`tsc`, the relevant tests). Sub agents do not see this conversation.
3. **Review every result yourself before reporting.** Read the diff (`git diff`), not the agent's summary. Check: design followed, banned types absent, duplication removed, comments accurate, tests meaningful. Run `tsc` and the affected tests yourself.
4. **Fix small review findings directly; send large ones back.** A misplaced comment or a missing type annotation you fix inline. A wrong design or a missed file goes back to the same agent via `SendMessage` so it keeps its context.
5. **If a sub agent stalls or hits a spend limit, finish from the diff on disk.** Do not re-run the whole task from scratch; the work that landed is usually most of it.
6. **Report outcomes, not process.** Say what changed, what you verified, and what the sub agents got wrong that you corrected.

## Before fan-out: throughput checkpoint

Write these four as todos before spawning any sub agent. A line that does not apply stays with `n/a: <reason>`.

- **Blocking first steps.** Gates that must land before parallel work (shared types, schema).
- **Independent workstreams.** Disjoint files, services, or layers run in parallel.
- **Shared mutable state.** Two agents never write the same file; split the target or serialise.
- **Smallest safe decomposition.** If one agent is best, say why.

## Bug fixes

Every shipped line traces to runtime evidence. A change that "might help" is a hypothesis, not a fix; revert it when evidence refutes it.

1. **Reproduce it yourself** on the real surface (agent-browser, Convex CLI, Eva MCP prod logs). A bug you cannot reproduce, you cannot prove fixed.
2. **Binary-search the cause.** List hypotheses, rule them out with logs or instrumentation, and confirm the surviving mechanism before planning the fix. Apply `principle-fix-root-causes`.
3. **Delegate the smallest fix** the evidence justifies, then review the diff.
4. **Verify on the same surface.** The original repro now passes. "Inconclusive" or a different surface is not a pass; say so.
5. **Land the failing repro before the fix** when a cheap test exists, so history shows red then green (`principle-sequence-verifiable-units`).

Report what was broken, the root cause, the fix, and the before/after repro output.
