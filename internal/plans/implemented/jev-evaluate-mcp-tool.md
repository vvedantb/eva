# Generic `evaluate` MCP tool backed by TypeSafe Jev

## Context

TypeSafe's Jev is a "System One" decision model: one piece of state in, typed answers (boolean / choice / score) with calibrated probabilities out. It never generates text. An agent benefits when it has many similar items to classify, rank or filter and wants a number to threshold on, rather than reasoning about each item inside its own context window.

Jev is on Vercel AI Gateway as `typesafe-ai/jev`, which Eva already uses (`AI_GATEWAY_API_KEY`, `textGen.ts`, `transcription.ts`). The AI SDK exposes it through `experimental_evaluate` from `ai` 7.0.105+. Eva's MCP server is injected into every sandbox harness and the orchestrator, so one tool definition reaches all of them and is callable from the code-mode `execute` tool for batching.

## Decisions (confirmed with user)

- One generic tool, `evaluate`. The agent writes the rubric per call. No presets; no task-tag or findings changes here.
- Transport: AI Gateway via `experimental_evaluate`; auth is the existing `AI_GATEWAY_API_KEY`. The `TYPESAFE_API_KEY` added to the prod Convex deployment is unused and can be removed (or kept for a later BYOK setup).
- Bump `ai` to 7.0.105 and `@ai-sdk/gateway` to 4.0.85 in backend and apps/web (web had to move too: the newer gateway's provider types no longer matched `ai` 7.0.40 in `useGatewayDictation.ts`). Both versions are under the repo's 7-day release soak, so `ai`, `@ai-sdk/gateway`, `@ai-sdk/provider` and `@ai-sdk/provider-utils` are in `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` with a dated comment; remove the exclusions after 2026-09-23.
- Visible to every MCP caller; `mutating: false`; zero data retention requested per call; `providerMetadata` passed through as `metadata`.

## Changes

- `packages/backend/convex/_mcp/jsonValue.ts` — shared `JsonValue` type + zod schema (moved out of `mcp/nodeActions.ts`).
- `packages/backend/convex/_mcp/evaluateTool.ts` — input schema and caps (200k chars state, 32 questions, 255 options/levels, 20k chars instructions), outcome types, agent-facing description, `evaluateTool(run)` factory.
- `packages/backend/convex/mcp/evaluate.ts` — `"use node"` `runEvaluate` action: env check, re-parse, `experimental_evaluate` with ZDR + `eva-mcp-evaluate` tag, 30 s timeout, 1 retry, answers normalised, errors returned as data (`missing_config` / `invalid_request` / `provider_error` + `retryable`).
- `packages/backend/convex/mcp/tools.ts` — registers the tool after `postgres_query`, outside the orchestrator gate.
- `packages/backend/convex/_sessions/prompts.ts` — one bullet in the orchestrator tool list.
- `packages/backend/tests/mcpEvaluateTool.test.ts` — schema, tool, code-mode and source-contract tests.
- `packages/backend/package.json`, `apps/web/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.

## Verification (done 2026-09-17)

- `pnpm install`; `npx convex codegen --typecheck enable` (backend); `pnpm typecheck` (web, backend, callback, annotation) green; `pnpm --filter @eva/backend test`: 1851 pass, 2 pre-existing failures in `turnUiProjectionContract.test.ts` (apps/web hook contract, untouched here); oxlint and prettier clean on the new files.
- `npx convex run mcp/evaluate:runEvaluate` on the dev deployment (which has `AI_GATEWAY_API_KEY`):
  - String state, boolean + 3-option choice + 4-level score: boolean 0.98; choice frontend 0.51 / backend 0.49 / infra 0; score 2.5 with probabilities keyed `"0"`..`"3"`. Gateway cost $0.000015, one provider attempt, ~190 ms, routing log confirms "ZDR requested: all 1 attempts support ZDR".
  - JSON object state, choice + boolean: `bug` at 1.0, repro 0.95, usage 374 in / 56 out tokens.
  - `metadata` has two keys: `gateway` (cost, generationId, routing) and `typesafe` with `confidence` as a map keyed by question id for choice (and score) answers, e.g. `{ kind: 1 }`.
- Not yet exercised: the MCP wire path from a sandbox (`evaluate` flat call and `execute` loop) on a deployed build, and the `missing_config` path with the key removed.

## Risks / follow-ups

- `experimental_evaluate` may change in patch releases; only `mcp/evaluate.ts` touches SDK types.
- Flatten `metadata.typesafe.confidence[questionId]` into the matching answer now the shape is known.
- Remove the soak exclusions after 2026-09-23. Delete `TYPESAFE_API_KEY` from Convex unless BYOK is planned.
- Candidate next uses: Jev-backed `generateTaskTags` (fixed vocabulary, thresholded `boolean` questions) and automation-findings severity/dedupe.
