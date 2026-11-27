# Decision records moved out of comments: scripts

Source: comment triage, 27 November 2026. Each line is file, symbol, decision. Written by Haiku agents; some entries state behaviour that the code already shows.

- `scripts/bump-claude-pins.mjs` | `(module)` (pin sites) | Five pin sites move together, and the contract test in `providerSdkDependenciesContract.test.ts` is the backstop that proves none drifted.
- `scripts/bump-claude-pins.mjs` | `(module)` (rebuild order) | The lockfile and node_modules must hold the new SDK before the callback bundle is rebuilt, because the bundle typecheck catches broken SDK types that would otherwise degrade silently to `any`.
- `scripts/bump-claude-pins.mjs` | `(module)` (single test file) | Only the contract test file runs after a bump, because the full suite would report unrelated failures as if the bump caused them.
- `scripts/bump-claude-pins.mjs` | `(module)` | Pins stay exact and this script moves them, because the callback parsers match one SDK message shape and models gate on the CLI version. Each edit must match exactly once, so a renamed constant fails loudly.
- `scripts/bump-claude-pins.mjs` | `latestPair` | The CLI build must be published before any pin is written, because an SDK pointing at a missing CLI would fail every sandbox launch-time install.
- `scripts/bump-claude-pins.mjs` | `latestPair` | The CLI version comes from the SDK manifest's `claudeCodeVersion` field, not from an assumed patch match, because the publisher's manifest is the source of truth.
- `scripts/bump-claude-pins.mjs` | `latestPair` | Two plain `npm view` field reads are used rather than `--json`, because each returns a bare string and there is no untyped blob to validate.
- `scripts/check-schema-narrowing.mjs` | `(module)` | The gate is a diff heuristic on field names, not a type checker, and fails on removals with no drained migration, because a revert once removed a field that production rows still held and forced emergency migrations.
- `scripts/check-schema-narrowing.mjs` | `git` | Stderr is piped so a missing ref throws quietly for the caller to handle, because a missing base ref is expected in some runs.
- `scripts/check-schema-narrowing.mjs` | `main` (base revision) | The base revision of `dataMigrations.ts` is searched too, because the change that removes a field often deletes its migration once it has run.
- `scripts/check-shared-backend.mjs` | `(module)` | Every Convex function the phone calls must also be called by the web, so the two clients cannot drift onto separate server paths, and a phone-only function needs a written reason.
- `scripts/compiler-check.mjs` | `(module)` | The compiler resolves through `apps/web`, so the check tests the same compiler the build runs.
- `scripts/compiler-check.mjs` | `(module)` | The gate fails on new React Compiler bailouts against a baseline, because build warnings scroll past unnoticed in a large build and nothing else stops a regression.
- `scripts/compiler-check.mjs` | `(module)` | Try/catch bailouts are linted live by `no-value-block-in-try`, and this script covers every other reason, so the two checks split the work.
- `scripts/compiler-check.mjs` | `CODE_FILTER` | Files without a component-shaped identifier are skipped, because the Vite React plugin skips them too and compiling them would report bailouts that the build never sees.
- `scripts/design-check.mjs` | `(module)` (baseline keys) | The baseline keys on file and reason pairs, not occurrences, so fixing some violations in a file does not touch the baseline and the count ratchets down only once a file is clean for that reason.
- `scripts/design-check.mjs` | `(module)` (baseline update) | The baseline may only be updated after the violation count falls, because accepting a fresh regression with `--update` defeats the gate.
- `scripts/design-check.mjs` | `(module)` (ignored lines) | Class context is tracked even on pragma-ignored lines, because skipping them would silently swallow the rest of a multi-line class call.
- `scripts/design-check.mjs` | `CLASS_CONTEXT_RE` | Only class context is scanned for colours, so theme tables, SVG fills, chart configs and canvas drawing keep their hex and rgb literals.
- `scripts/design-check.mjs` | `HARDCODED_COLOUR_RE` | The regex matches only copy-pasted literals, not colours hidden behind a variable, because the goal is the literal and not every path a colour can take.
- `scripts/design-check.mjs` | `QUOTED_STRING_RE` | Quote matching is naive by choice, because it misses some escaped apostrophes but avoids crying wolf.
- `scripts/design-check.mjs` | `RAW_BUTTON_RE` | The `|$` branch matches a `<button` alone on a line, because prettier puts it there whenever the attribute list wraps.
- `scripts/design-check.mjs` | `RAW_RADIUS_RE` | `rounded-full` and `rounded-none` stay allowed, even directional, because they are real circles and square corners, not raw radius scale values.
- `scripts/design-check.mjs` | `REDUCED_MOTION_RE` | The web app has no reduced-motion mode, so only "Disable page animations" turns motion off and the reduced-motion gates are banned.
- `scripts/design-check.mjs` | `openParenDelta` | Only parentheses carry class context across lines, because counting braces would keep the context open across a wrapped style object, where a hex literal is correct.
- `scripts/design-check.mjs` | `raw-button` check | `packages/ui/src` is exempt, because the Button primitive lives there and a literal `<button>` is expected.
- `scripts/design-check.mjs` | `shadow-outside-overlay` check | The check is limited to `apps/web/src`, because floating overlay primitives that keep a shadow live in `packages/ui/src`.
- `scripts/design-check.mjs` | `text-white-black` check | `packages/ui/src` is not exempt, because genuine scrim cases there go in the baseline rather than a blanket allowance.
- `scripts/design-check.mjs` | `walk` | Missing scan roots are skipped without error, because a partial checkout may not contain them.
