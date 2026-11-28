# Plan 014: A project's task list reads only its own tasks' run summaries

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (if that file exists) — unless a reviewer dispatched
> you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/_agentTasks/queries.ts packages/backend/convex/_agentTasks/runSummary.ts packages/backend/convex/schema.ts packages/backend/tests/convexHotPathIoContract.test.ts packages/backend/tests/taskListRunSummaries.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`schema.ts` changes often; only the
> `agentTaskRunSummaries` table at lines 155–161 matters.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

`agentTasks.listByProject` is a live query on every open project page
(`apps/web/src/lib/components/projects/ProjectActiveLayout.tsx:60`). To add
`lastRunStartedAt` to a handful of tasks, it reads **every**
`agentTaskRunSummaries` row in the repo through the `by_repo` index. The cost
grows with the repo's total task count, not the project's. Worse, the query
subscribes to all those rows, so any run start on any task in the repo
re-runs every open project task list. After this plan, `listByProject` does
one bounded `by_task` point read per task in the project, so its read set and
its invalidations are limited to that project. The output stays the same.

## Current state

Files:

- `packages/backend/convex/_agentTasks/queries.ts` — task list queries.
  `enrichTasksWithLastRun` (lines 56–121) does the repo-wide read (lines
  70–77). It has exactly **two callers**: `listByProject` (lines 123–142) and
  `getAllTasks` (lines 312–341).
- `packages/backend/convex/_agentTasks/runSummary.ts` — writers for the
  summary table. Every writer looks rows up `by_task` with `.unique()`, so the
  table holds at most one row per task.
- `packages/backend/convex/schema.ts:155-161` — the table and both indexes:

```ts
  agentTaskRunSummaries: defineTable({
    taskId: v.id("agentTasks"),
    repoId: v.id("githubRepos"),
    lastRunStartedAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_repo", ["repoId"]),
```

`queries.ts:56-88` today:

```ts
/** Enriches each task with its most recent run start and its busy state. */
async function enrichTasksWithLastRun(
  db: QueryCtx["db"],
  userId: Id<"users">,
  tasks: Array<Doc<"agentTasks">>,
) {
  const repoIds = [...repoIdsOf(tasks)];
  const [openChatEntityIds, awaitingAnswerIds, unreadByRepo, summaryGroups] =
    await Promise.all([
      turnIdsForRepos(db, tasks, openChatEntityIdsForRepo),
      turnIdsForRepos(db, tasks, awaitingAnswerEntityIdsForRepo),
      Promise.all(
        repoIds.map((repoId) => unreadLookupForRepo(db, userId, repoId)),
      ),
      Promise.all(
        repoIds.map((repoId) =>
          db
            .query("agentTaskRunSummaries")
            .withIndex("by_repo", (q) => q.eq("repoId", repoId))
            .collect(),
        ),
      ),
    ]);
  ...
  const summariesByTask = new Map(
    summaryGroups.flat().map((summary) => [String(summary.taskId), summary]),
  );
```

Lines 90–120 then use `summariesByTask.get(String(task._id))`, and fall back
to the newest `agentRuns` row (`by_task`, `.order("desc").first()`) when a
task has no summary row.

`listByProject`, `queries.ts:124-142`, reads only the project's tasks
(`agentTasks.by_project`) and then calls
`enrichTasksWithLastRun(ctx.db, ctx.userId, sorted)`.

`getAllTasks`, `queries.ts:312-341`, reads every non-draft, non-deleted task
in one repo and calls `enrichTasksWithLastRun(ctx.db, ctx.userId, tasks)`.

### Decision: keep `by_repo` for `getAllTasks`

`getAllTasks` already reads nearly every task in the repo, so one `by_repo`
range read is cheaper than one point read per task, and it stays well clear
of Convex's per-function limit on the number of index reads in large repos.
Only `listByProject` switches to `by_task`. The choice is made explicit at
the call site, not guessed from the task count.

### Output equivalence detail

With the `by_repo` read, if two summary rows ever existed for one task, the
`Map` kept the **last** row in `by_repo` index order, which is the newest
`_creationTime`. The `by_task` lookup must pick the same row:
`.withIndex("by_task", …).order("desc").first()`. Do **not** use `.unique()`
in a query (it throws on a duplicate, which would break the page).

One case can differ, and only for the better: a summary row whose `repoId`
does not match the task's `repoId` (it should not exist; `moveTaskRunSummary`
keeps them in sync). `by_repo` missed such a row and fell back to
`agentRuns`; `by_task` finds it.

There is an existing source-level guard in
`packages/backend/tests/convexHotPathIoContract.test.ts:76-90` ("task lists
use summaries and every run creator updates them"). It requires
`.query("agentTaskRunSummaries")` to stay in `queries.ts` and
`getAllTasks` to use `by_repo_status_and_deleted`. Both remain true.

### Conventions that apply (quoted)

From `CLAUDE.md`:

- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions."
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)." (This is a small change; a changelog line is still welcome, see Step 4.)

From `docs/eva-convex.md`:

- "Never manually define interfaces for Convex documents. Always import: `Doc<"tableName">`, `Id<"fieldName">`".

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0, no errors |
| New test  | `pnpm --filter @eva/backend test -- tests/taskListRunSummaries.test.ts` | all pass |
| Guard test | `pnpm --filter @eva/backend test -- tests/convexHotPathIoContract.test.ts tests/quickTaskRestore.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. Do not run
the full backend suite: five tests already fail at planning time
(`pendingQuestion`, `sessionStopRecoveryContract` ×3,
`providerAccountHandoffContract`) and are not yours to fix.

## Suggested executor toolkit

- `convex-performance-audit` skill, for the read-set and subscription
  reasoning.
- Test pattern: `packages/backend/tests/artifactState.test.ts` (convex-test
  with `t.withIdentity({ subject: <clerkId> })` against a `users` row whose
  `clerkId` is that subject).

## Scope

**In scope** (the only files you should modify):

- `packages/backend/convex/_agentTasks/queries.ts`
- `packages/backend/tests/taskListRunSummaries.test.ts` (create)
- `packages/backend/tests/convexHotPathIoContract.test.ts` (add one assertion)
- `internal/changelog/2026-11.md` (or the current month's file)

**Out of scope** (do NOT touch):

- `schema.ts` — both indexes already exist; no index change.
- `_agentTasks/runSummary.ts` and `dataMigrations.ts` — writers are correct.
- `getAllTasks` behaviour — it keeps the `by_repo` read (see Decision).
- The `agentRuns` fallback in `enrichTasksWithLastRun` — keep it as is.
- Any change to the returned shape (`agentTaskWithLastRunValidator`).

## Git workflow

- Stay on the current branch. Do NOT create a branch, push, or open a PR
  unless the operator told you to.
- Conventional commits, matching `git log`, e.g.
  `perf(tasks): read run summaries per task for project task lists`.
  Commit the characterisation test first (Step 1), then the change.

## Steps

### Step 1: Pin today's output with a characterisation test

Create `packages/backend/tests/taskListRunSummaries.test.ts`, modelled on
`tests/artifactState.test.ts` (`convexTest(schema, modules)`,
`const modules = import.meta.glob("../convex/**/*.ts")`, `TIMEOUT_MS = 30_000`).

Fixture (one `t.run`):

- user `ada` with `clerkId: "clerk|run-summary-ada"`.
- repo with `owner`, `name`, `installationId: 1`, `connectedBy: ada` (so
  `hasRepoAccess` passes via `connectedBy`).
- two projects in that repo, `A` and `B` (copy the required project fields
  from `tests/prClosedProjectScope.test.ts:47-56`: `repoId`, `userId`,
  `title`, `rawInput`, `phase`, `numId`).
- tasks (fields as in `prClosedProjectScope.test.ts:60-71`, plus
  `projectId`, `taskNumber`):
  - `a1` in A, status `"todo"`, with a summary row
    `{ taskId: a1, repoId, lastRunStartedAt: 1000 }`.
  - `a2` in A, status `"in_progress"`, with **no** summary row but one
    `agentRuns` row `{ taskId: a2, status: "success", logs: [], startedAt: 2000 }`
    (exercises the fallback; add any other required `agentRuns` fields the
    schema demands).
  - `a3` in A, status `"todo"`, with a summary row and no
    `lastRunStartedAt` (the "never ran" sentinel).
  - `b1` in B, status `"todo"`, summary `lastRunStartedAt: 5000`.

Tests:

1. "listByProject returns each task's last run start" — call
   `asAda.query(api.agentTasks.listByProject, { projectId: A })`; expect
   `ids` in `taskNumber` order and
   `lastRunStartedAt` equal to `[1000, 2000, undefined]`; `b1` is absent.
2. "getAllTasks returns the same values repo-wide" — call
   `asAda.query(api.agentTasks.getAllTasks, { repoId })`; build a map
   `_id → lastRunStartedAt`; expect `a1 → 1000`, `a2 → 2000`,
   `a3 → undefined`, `b1 → 5000`.
3. "a duplicate summary row resolves to the newest" — insert a second summary
   row for `a1` with `lastRunStartedAt: 3000` (inserted after the first, so it
   has the later `_creationTime`); `listByProject(A)` returns `3000` for `a1`.

**Verify**: `pnpm --filter @eva/backend test -- tests/taskListRunSummaries.test.ts`
→ 3 tests pass **on the unchanged code**. If any fails now, STOP: the
characterisation is wrong or the current behaviour differs from this plan.
Commit this test on its own.

### Step 2: Make the summary lookup scope explicit

In `packages/backend/convex/_agentTasks/queries.ts`:

1. Add, above `enrichTasksWithLastRun`:

   ```ts
   /**
    * How a task list reads `agentTaskRunSummaries`. "repo" is one range read
    * per repo, for lists that hold most of a repo's tasks. "perTask" is one
    * bounded point read per task, so a small list (one project) neither reads
    * nor re-runs on the rest of the repo's summaries.
    */
   type RunSummaryScope = "repo" | "perTask";

   async function runSummariesByTask(
     db: QueryCtx["db"],
     tasks: ReadonlyArray<Doc<"agentTasks">>,
     scope: RunSummaryScope,
   ): Promise<Map<string, Doc<"agentTaskRunSummaries">>> {
     if (scope === "perTask") {
       const rows = await Promise.all(
         tasks.map((task) =>
           db
             .query("agentTaskRunSummaries")
             .withIndex("by_task", (q) => q.eq("taskId", task._id))
             // Newest row wins, as the repo read's Map did on a duplicate.
             .order("desc")
             .first(),
         ),
       );
       const byTask = new Map<string, Doc<"agentTaskRunSummaries">>();
       for (const row of rows) {
         if (row) byTask.set(String(row.taskId), row);
       }
       return byTask;
     }
     const groups = await Promise.all(
       [...repoIdsOf(tasks)].map((repoId) =>
         db
           .query("agentTaskRunSummaries")
           .withIndex("by_repo", (q) => q.eq("repoId", repoId))
           .collect(),
       ),
     );
     return new Map(
       groups.flat().map((summary) => [String(summary.taskId), summary]),
     );
   }
   ```

   Do not "simplify" the loop into a `flatMap` with an `as const` tuple:
   `CLAUDE.md` bans `as`, and `.oxlintrc.json` sets
   `typescript/consistent-type-assertions` to `assertionStyle: "never"`.

2. Change `enrichTasksWithLastRun` to take the scope as a fourth parameter
   `summaryScope: RunSummaryScope`, replace the fourth `Promise.all` entry
   (lines 70–77) with `runSummariesByTask(db, tasks, summaryScope)`, rename the
   destructured `summaryGroups` to `summariesByTask`, and delete the old
   `summariesByTask` construction (lines 86–88). Everything else in the
   function stays.

3. Callers:
   - `listByProject` (line 140): `enrichTasksWithLastRun(ctx.db, ctx.userId, sorted, "perTask")`.
   - `getAllTasks` (line 339): `enrichTasksWithLastRun(ctx.db, ctx.userId, tasks, "repo")`.

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `pnpm --filter @eva/backend test -- tests/taskListRunSummaries.test.ts` → 3 pass (unchanged output).
- `grep -n "enrichTasksWithLastRun(" packages/backend/convex/_agentTasks/queries.ts` → 3 lines: the definition, one with `"perTask"`, one with `"repo"`.

### Step 3: Guard the choice

In `packages/backend/tests/convexHotPathIoContract.test.ts`, inside the test
"task lists use summaries and every run creator updates them" (around line
76), add:

```ts
    // A project's list must not read (or re-run on) the whole repo's rows.
    expect(
      definitionBody("_agentTasks/queries.ts", "listByProject"),
    ).toContain('"perTask"');
```

**Verify**: `pnpm --filter @eva/backend test -- tests/convexHotPathIoContract.test.ts tests/quickTaskRestore.test.ts`
→ all pass.

### Step 4: Lint and changelog

Add at the top of `internal/changelog/2026-11.md` (current month's file,
directly under its heading):

```markdown
## Project task lists read only their own run summaries - <YYYY-MM-DD>

- `listByProject` read every `agentTaskRunSummaries` row in the repo (`by_repo`) and re-ran on any run start in the repo. It now does one `by_task` read per project task. `getAllTasks` keeps the repo read. Output unchanged (`tests/taskListRunSummaries.test.ts`).
```

**Verify**: `pnpm lint` → exit 0.

## Test plan

- New file `packages/backend/tests/taskListRunSummaries.test.ts` with 3 tests:
  project list values (summary, fallback, sentinel), repo list values, and
  duplicate-row tie-break. Written and passing **before** the change, and
  still passing after.
- One new source assertion in `convexHotPathIoContract.test.ts`.
- Pattern: `tests/artifactState.test.ts` for identity; fixture fields from
  `tests/prClosedProjectScope.test.ts`.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/taskListRunSummaries.test.ts tests/convexHotPathIoContract.test.ts tests/quickTaskRestore.test.ts` passes
- [ ] `pnpm lint` exits 0
- [ ] `grep -n '"perTask"' packages/backend/convex/_agentTasks/queries.ts` matches the `listByProject` call
- [ ] `git status` shows only in-scope files modified
- [ ] Changelog entry added; `plans/README.md` status row updated (if the file exists)

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match the live code (drift).
- The Step 1 tests fail on the unchanged code.
- A third caller of `enrichTasksWithLastRun` exists
  (`grep -rn "enrichTasksWithLastRun" packages/backend/convex`). The scope for
  it is a judgment call — report it.
- The change seems to need a schema or index change.

## Maintenance notes

- Any new caller of `enrichTasksWithLastRun` must pick a scope on purpose:
  `"perTask"` for small, bounded lists; `"repo"` only for lists that hold most
  of a repo's tasks.
- If `getAllTasks` is ever paginated, switch it to `"perTask"` too (a page is
  a small set).
- The other three repo-wide reads in this function
  (`openChatEntityIdsForRepo`, `awaitingAnswerEntityIdsForRepo`,
  `unreadLookupForRepo`) also scale with the repo. They were left out of this
  plan; measure before changing them.
- Reviewer: check the `perTask` branch orders `desc` (tie-break parity) and
  that the fallback to `agentRuns` is untouched.
