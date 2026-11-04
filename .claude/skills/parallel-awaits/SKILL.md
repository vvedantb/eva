---
name: parallel-awaits
description: Deep-scan hot paths for unnecessary sequential async calls and parallelise the safe ones. Use when the user asks to find or fix sequential awaits, waterfalls, "make these calls parallel", or "scan hot paths for slow async". Works on the whole repo, a path, or only the current diff.
---

# Parallel awaits

Find awaits that run one after another but do not depend on each other. Fix the safe ones with `Promise.all`. Leave the rest, and say why.

## 1. Scan

Run from the repo root:

```bash
node .claude/skills/parallel-awaits/scan-awaits.cjs                     # whole repo
node .claude/skills/parallel-awaits/scan-awaits.cjs packages/backend/convex/mcp
node .claude/skills/parallel-awaits/scan-awaits.cjs --diff origin/main  # changed files only
```

- `PAIR`: `const a = await A` then `const b = await B`, and B uses nothing declared since A.
- `LOOP`: a loop that awaits reads one at a time.
- `--all` also reports bare `await x();` pairs. These are mostly ordered writes, so they are noisy.

The scanner sees only straight-line code. Read the real code for every hit before you change it.

## 2. Rank by hotness

Fix in this order:

1. Action round trips: `ctx.runQuery`, `runMutation`, `runAction`, `runQueryAsUser`, sandbox `exec`, Vercel, GitHub, `fetch`. Each one costs a network round trip.
2. Shared helpers that many callers use, for example `gatherAccessibleRepos`, `getSandboxHandle` and `resolveSandboxCredentials`.
3. Reactive queries: lists, chat status, team members, users, usage limits.
4. Chat-turn prompt builds and MCP tool handlers, because agents call them all the time.
5. Crons that fan out per sandbox.

Do not fix migrations, one-off scripts, demo animations or rare admin paths.

## 3. Rules: when you must not parallelise

- **Writes and order.** Never parallelise `insert`, `patch`, `delete`, `allocateNumId`, `createNotification`, scheduler calls, or workflow `step.*` calls.
- **Mutation read sets.** An extra early read in a mutation adds to its read set. If that range changes often, OCC conflicts increase. Keep the read lazy.
- **Lazy fallbacks.** Do not turn "try A, then B if A is empty" into two reads when A usually hits. Example: an owner lookup by sandbox.
- **Guards and errors.** If A throws a user-visible error, B must not throw a different error first. Do not run side effects that the guard should block.
- **Secrets.** The authorisation check stays first when B reads or decrypts secrets.
- **Loops.** Skip loops that `break` or `return`, carry state, paginate, or poll. Also skip unbounded fan-out to external APIs, because of rate limits. Skip large-payload loops, because of memory.
- **Cheap calls.** `ctx.auth.getUserIdentity()` is local. A pair that starts with it is not worth a change.

## 4. Fix patterns

```ts
// Independent reads
const [task, user] = await Promise.all([ctx.db.get(taskId), ctx.db.get(userId)]);

// Keep A's error priority: start B, check A, then await B
const reposPromise = listRepos(ctx);
const session = await getSession(ctx, id);
if (!session) throw new Error("Session not found");
const repos = await reposPromise;

// Loop of independent reads, order kept
const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
```

- Pattern 2 risks an unhandled rejection if A throws while B also rejects. Use it only when B cannot reject, or attach `.catch` to B.
- Look for duplicate work as well as waterfalls. Examples: a credential resolve that the next helper repeats, or a second repo read after a helper that already returns the repo. Read the helper to confirm it before you delete the call.
- Repo rules still apply: no `any`, `unknown`, `as` or `!`, no new deps, and keep diffs small.

## 5. Scale out (whole-repo runs only)

- Split the hits into groups that do not share files, for example sandbox actions, GitHub and MCP, and queries and mutations.
- Give each group to a fork with these rules. Forks do not run `tsc`.
- When the forks finish, review the riskiest edits yourself. Removed calls and changed error order come first.

## 6. Verify and report

1. Run `tsc --noEmit` for each package you touched. Backend: `cd packages/backend && npx tsc --noEmit -p convex`.
2. Grep the diff for banned types.
3. Report each fix: file, what now runs in parallel, and the saving (for example "1 runQuery round trip per sandbox start").
4. List the notable hits you rejected, one line each, with the rule.
5. Add a changelog entry for a medium or larger sweep.
