# Jev inside Eva: task tags, findings triage, draft readiness, mention routing, skill suggestions

## Context

PR #785 gave Eva a generic `evaluate` MCP tool backed by TypeSafe Jev (state + typed boolean/choice/score questions in, probabilities out) via Vercel AI Gateway. This change uses the same model inside Eva's own product logic in five places. Each replaces a text-generation call that was then parsed, a hard-coded rule, or a purely manual step with a typed, thresholded decision.

Decisions (confirmed with user): mentions judged "nothing" become low-urgency rows, never dropped; urgency drives delivery (high = email in ~1 min, normal = daily digest, low = inbox only); findings get sort + badge + pre-ticked high/critical + duplicate hints; draft readiness is a nudge only (Run stays enabled); skill suggestions are chips above the composer that insert the skill token.

## Shared plumbing — `packages/backend/convex/_jev/`

- `schema.ts`: the zod input schema, caps and outcome types, moved out of `_mcp/evaluateTool.ts` (which now only holds the MCP tool and re-exports the schema).
- `client.ts` (`"use node"`): `evaluateDecision(input, { tag })` — the one place Eva calls Jev. Env check, zod re-parse, `experimental_evaluate` with zero data retention and a per-feature gateway tag, error classification. `mcp/evaluate.ts` is now a one-line wrapper.
- `answers.ts`: `readBoolean` / `readChoice` / `readScore` / `readConfidence`, all null-on-miss.
- `jsonValue.ts` moved here from `_mcp/`.
- Web: `apps/web/src/lib/hooks/useIdleCallback.ts` — trailing debounce with refs only (no `useEffect`), pure core `createIdleCallback` tested with fake timers.

## Features

1. **Task tags** (`textGen.ts` `generateTaskTags`, `packages/shared/src/taskTags.ts`): one boolean question per unapplied tag with a one-line rubric from `TASK_TAG_DESCRIPTIONS`; `selectTagsByProbability` keeps ≥ 0.6, sorts desc, caps at 3. `createTasksFromFindings` now also schedules tagging. Gateway tag `eva-task-tags`.
2. **Findings triage** (`automationTriage.ts`, `_automations/triageMapping.ts`, `_automations/runs.ts`, `_agentTasks/queries.ts` `listOpenTaskTitles`, web `automations/_components/{FindingsList,FindingRow,findingsTriage}.tsx|ts`): scheduled from `updateRunStatus`; per finding a severity score over four described levels and a duplicate choice over up to 120 open task titles; verdict stored as `finding.triage`. UI sorts by effective severity, badges it (tooltip "Agent said …" on disagreement), hints "Looks like task #N" at duplicate probability ≥ 0.7, and pre-ticks high/critical non-duplicates via an `overrides` set relative to per-render defaults. Tag `eva-findings-triage`.
3. **Draft readiness** (`draftReadiness.ts`, `_agentTasks/readiness.ts`, web `quick-tasks/_hooks/useDraftReadiness.ts`, `_components/DraftReadinessBanner.tsx`, `readinessHints.ts`): three booleans (target / expected / current) plus a four-level readiness score, cached 1 h; debounced 800 ms after 40+ chars; banner under the description when score < 0.5 naming the missing signals; Dismiss per judged text; Create Task unchanged. Tag `eva-draft-readiness`.
4. **Mention routing + urgency** (`mentionRouting.ts`, `_mentions/routingUrgency.ts`, `_mentions/notifyChatMentions.ts`, `notifications.ts`, `schema.ts`, `_validators/enums.ts`, web inbox): `notifications.urgency` (low | normal | high, undefined = unrouted/legacy = normal). Mentions no longer schedule the 15-min email at creation; routing asks one choice (reply / fyi / none) and `setUrgency` schedules a 60 s email for high only. Digest excludes low; instant email includes only high or unrouted mentions. Routing failure → legacy 15-min email. Inbox gains Group → Urgency ("Needs reply" / "FYI" / "Low priority"), urgency-rank sort inside every grouping, a "Needs reply" badge, muted low rows, and toasts that wait for routing and skip low. Tag `eva-mention-routing`.
5. **Skill suggestion chips** (`skillSuggestions.ts`, `_skillSuggestions/rank.ts`, web `chat/_components/{useSkillSuggestions,skillSuggestionsPick,SkillSuggestionChips}`): as the draft goes idle for 700 ms (16+ chars), rank the composer's skill catalogue with a `needsSkill` boolean and a `skill` choice with a `none` escape; show up to three chips (probability ≥ 0.15, needsSkill ≥ 0.5) above the input card; clicking inserts the `/skill` token via `insertSkill` and hides the chip. Reaches sessions, tasks, projects and the new-session composer. Tag `eva-skill-suggestions`.

## Verification (2026-09-18)

- `npx convex codegen`, `pnpm typecheck` (web, backend, callback, annotation) clean; backend 2103 tests pass (`sourceEncoding` passes once the `jsonValue.ts` move is staged); web 875 pass with 2 pre-existing failures on HEAD (`motionContract` on `SessionSourcePane.tsx`, `composerUnderCardBar` stale assertion). oxlint and prettier clean on every touched file.
- Live against the local backend (has `AI_GATEWAY_API_KEY`): `draftReadiness:assessInternal` on a vague draft → score 0.03, missing `expected`. In the shared browser: session composer with "record a demo video …" showed `eva-product-video` and `eva-capture` chips, clicking inserted `/eva-capture`; quick-task modal with a vague 90-char description showed the banner "Add: what should happen." and Dismiss hid it; inbox filter menu offers Group → Urgency.
- Not exercised live: findings triage UI (no local run has findings) and a real mention round trip; both covered by unit and source-contract tests.

## Risks / follow-ups

- `experimental_evaluate` may change; only `_jev/client.ts` touches SDK types.
- Thresholds are named constants (0.6 tags, 0.7 duplicate, 0.5 readiness, 0.15 / 0.5 skills); tune after observing gateway tags per feature.
- Unrouted mention can ride along in an instant email triggered by another notification during the routing window; accepted.
- Dictation and transcript polish set the description directly and skip readiness re-evaluation; accepted.
- `TYPESAFE_API_KEY` on prod Convex remains unused; delete unless BYOK is planned. Remove the AI SDK soak exclusions in `pnpm-workspace.yaml` after 2026-09-23.
