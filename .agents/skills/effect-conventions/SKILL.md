---
name: effect-conventions
description: How Effect (effect-ts v3) is used in this repo — typed errors, retry schedules, Schema at stream boundaries, and the runtime edges. Use when writing, reviewing, or extending any code that imports from "effect" in packages/backend, or when continuing the incremental Effect adoption phases.
---

# Effect in this repo

Effect is adopted incrementally in `packages/backend` (`effect@3.x`, pinned to
stable — do not install `effect@rc`/v4 or follow v4-era guidance until the
migration phase). It is used "at the edge": inside existing `async` functions,
never leaking into a caller's signature, error handling, or React code.

Before writing Effect code, read the existing pattern files listed under each
convention — they are the reference implementation, not this document.

## Where Effect is and is not allowed

- **Yes:** `"use node"` Convex actions and their helpers, `callback-src/`
  (sandbox-side Node program), pure modules under `convex/_git`, `convex/_github`,
  `convex/_effect`, `convex/_sandbox*`.
- **Sparingly, and only via the runner:** V8-isolate Convex modules (queries,
  mutations, non-node actions) may import `effect` when an action needs its
  failures to reach the user through `runActionEffect` (see below). Each isolate
  module that does so pays ~500KB of effect in its bundle (measured on
  `convex/docs.ts`: 1.49MB → 2.02MB), so do not add `effect` to a shared
  isolate module casually, and keep `convex/_sandbox/provider.ts` `import type`-only
  from the workflow modules that reach it.
- **Never:** `apps/web`, `packages/ui`, `@convex-dev/workflow` step retry policy
  (`convex/workflowManager.ts` owns durable retries; Effect `Schedule` is only for
  retries _inside_ a single action).

## Running an Effect from async code

Use `runPromiseRethrowing` from `convex/_effect/retry.ts`. Never bare
`Effect.runPromise` — it rejects with a `FiberFailure` wrapper and every caller
in this codebase does `instanceof` or message checks on the caught error.

```ts
return await runPromiseRethrowing(
  pipeline.pipe(Effect.mapError((failure) => failure.cause)),
);
```

`Effect.mapError((f) => f.cause)` before the runner hands the original thrown
object back to the caller. When the tagged error itself is the right thing to
throw (a sentinel eva raised, whose `message` downstream matches on), omit it.

## Typed errors

- Errors are `Data.TaggedError` classes with a single props object:
  `new SandboxGoneError({ message })`, `new GitNetworkError({ message, cause, exitCode, output })`.
  `_tag` is the discriminant; `name` equals the tag automatically; `instanceof`
  works. Props are declared in the type parameter — never redeclare them as class
  fields (with `useDefineForClassFields` they would be reset to `undefined`).
- Classification happens **once, at the boundary**, in a module that owns the
  rules; call sites match on `_tag`:
  - `convex/_sandbox_runtime/sandboxErrors.ts` — provider/sandbox failures
    (`classifySandboxError`, `isSandboxGoneError`). Read its header comment: the
    invariant is that in-VM command output can never classify a live sandbox as gone.
  - `convex/_git/gitErrors.ts` — `classifyGitFailure` over sandbox git stderr →
    `GitNetworkError | GitNonFastForwardError | GitMissingRemoteRefError | GitCommandError`.
  - `convex/_github/githubErrors.ts` — `classifyGitHubFailure` over octokit
    failures; `githubRequest(() => octokit...)` is the boundary every octokit call
    belongs behind.
- Adding a new failure kind = add a class + a rule in the owning classifier +
  a corpus case in its test. Do not add `message.includes(...)` at a call site.
- Every classifier keeps the original error as `cause` for rethrow at the edge.

## Retries and timeouts

- `Effect.tryPromise({ try, catch: classifyX })` so the error channel is the
  tagged union; `Effect.retry({ schedule, while: (f) => f._tag === "..." })`.
- Shared schedules live in `convex/_effect/retry.ts`: `retryAfterDelays([...ms])`
  (one retry per entry) and `retryLinearBackoff(attempts, stepMs)`. Add a helper
  there only when ≥2 call sites share the shape.
- A step that must never be retried goes in `Effect.promise` (its failure is a
  defect, which `Effect.retry` skips); a retryable step goes in `Effect.tryPromise`.
  See `pushBranchToOrigin` in `convex/_sandbox_runtime/git.ts`.
- Preserve attempt counts, delays, predicates, and log lines when converting a
  loop. Log inside `Effect.tapError`, gated on "will retry".

## Schema at stream boundaries (`callback-src/parse/`)

- Declare a `Schema.Struct` per event/result shape, colocated in the module;
  decode with `Schema.decodeUnknownOption` / `decodeUnknownEither` — never the
  throwing variants. A malformed line must never throw and never drop partial
  data the old code kept.
- Use the `lenient(schema)` union (`Schema.Union(schema, Absent)`) from
  `callback-src/parse/sdkTaxonomy.ts` so one bad field decodes to `undefined`
  instead of failing the whole struct.
- Non-empty vs non-blank vs trimmed strings are three different rules — pick the
  schema that matches the old behaviour exactly (see `toolResultCapture.ts`).
- Freeform tool-input sniffing and `JsonValue` union narrowing stay hand-rolled
  on purpose; do not force Schema where it makes the code worse.
- Changing `callback-src` requires `pnpm --filter @eva/backend build:callback`
  to regenerate the checked-in bundle (control bytes are escaped by the build).

## Verification bar for any conversion

1. Behaviour-preserving by construction; prove it with a differential harness
   (old implementation vs new over a corpus) or by copying the old predicate
   bodies into the test as fixtures (see `tests/gitErrors.test.ts`,
   `tests/githubErrors.test.ts`).
2. `pnpm --filter @eva/backend typecheck` (tsgo) and the full backend vitest
   suite. Contract tests that grep source text will break — rewrite them to guard
   the same invariant against the new structure, never delete them.
3. House rules still apply: no `any`, no `as` (except `as const`), no non-null `!`.

## Looking things up

Do not guess Effect APIs (`Effect.match`, `Effect.cachedWithTTL` and similar do
not exist). Use the `effect-docs` MCP server (`effect_docs_search`, then
`get_effect_doc`) or read `node_modules/effect/dist/dts/*.d.ts` for the installed
version.

## Adoption roadmap (for continuity)

Done: (1) tagged sandbox errors + retry schedules, (2) Schema in
`callback-src/parse/`, (3) git/GitHub failure classifiers, (4) tagged errors
across the Convex wire, (5) provider `*ParseLine` parsers on Schema — the
agent-stream boundary is complete. Shared stream-schema helpers live in
`callback-src/parse/schemaHelpers.ts` (`lenient`, `Text`, `NonEmptyText`,
`OptionalText`, `TextArray`); do not redeclare them in a module.

Open follow-ups, by value: `_github/userAuth.ts` ~202 and `prDiff.ts` ~347
fold a rate-limited 403 into "not authorized" / "blob too large" — use
`GitHubRateLimited`; a shared tag→tone mapping in the web so
`GitHubBranchNotAhead` renders informational rather than destructive; more
actions through `runActionEffect`, chosen by which "Server Error" toasts users
actually hit. Migration to Effect v4 is deferred until a stable 4.1; the
official `Effect-TS/skills` repo has an `effect-v3-to-v4` skill for that day.

## Making an action's failures visible to the user

Production Convex redacts a thrown `Error` to "Server Error"; only
`ConvexError.data` crosses the wire. Run the handler body through
`runActionEffect(effect, label)` from `convex/_effect/action.ts`:

- A **Fail** in the error channel (any `Data.TaggedError` with a `message`) is
  logged and rethrown as `ConvexError({ tag: _tag, message })` — the contract is
  `@eva/shared/convexErrorPayload` (`tag`, not `_tag`: Convex fields cannot start
  with an underscore). The web reads it with `convexErrorMessage` /
  `convexErrorTag` in `apps/web/src/lib/utils/convexErrorMessage.ts`.
- A **Die** (defect) is rethrown unchanged and stays redacted. Make an outcome
  visible by putting it in the error channel (`Effect.fail(new SomeTag({ message }))`
  or `Effect.tryPromise({ catch: classifyX })`); leave infrastructure calls
  (`ctx.runQuery` etc.) in `Effect.promise` so their failures stay defects.
- Use a specific classifier when one exists (`classifyPrActionFailure` in
  `_github/prErrors.ts`); `UnexpectedActionFailure` is the catch-all for a
  failure that must be visible but has no specific tag.
- There is deliberately no `customAction`-based `effectAction` wrapper: the
  runner drops into any `action`/`authAction` handler as-is.
- Any web caller that catches an action error must go through
  `convexErrorMessage` (or `convexErrorPresentation`, which also returns a
  `tone` from the single tag→tone table — add a tag there when the outcome is
  not a failure), or a structured payload renders as a JSON blob.
- Pick actions to convert from prod evidence (Axiom dataset `eva`, filter
  `['data.status'] == "failure"` by `['data.function.path']`), not by sweep.
