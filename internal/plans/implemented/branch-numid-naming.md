# Plan: readable `numId`-based branch names

## Goal

Name every Eva-created git branch after the entity's per-app `numId` (the number
shown in the URL, e.g. `.../eva/web/sessions/35`) instead of the opaque Convex
`_id`. Applies to **new** entities only; existing rows keep their stored
`branchName`.

## Final branch format

```
eva/<app>/<entity>-<numId>[-vN]
```

- `<app>` = the sibling repo's `rootDirectory`, slugified to a single segment.
- `<app>` is **omitted** for single-app / root repos (no `rootDirectory`).

| Entity               | Sub-app (`rootDirectory = "web"`) | Single-app / root repo     |
| -------------------- | --------------------------------- | -------------------------- |
| Session              | `eva/web/session-35`              | `eva/session-35`           |
| Quick task           | `eva/web/task-12`                 | `eva/task-12`              |
| Project              | `eva/web/project-7`               | `eva/project-7`            |
| Project re-run (v2+) | `eva/web/project-7-v2`            | `eva/project-7-v2`         |
| Automation run       | `eva/web/automation-3-<runId>`    | `eva/automation-3-<runId>` |
| Design session       | `eva/web/design-4`                | `eva/design-4`             |

Nested `rootDirectory` (e.g. `packages/api`) slugifies the slash to one segment:
`eva/packages-api/task-12`.

## Why this shape

- **`numId`, not `_id`** — readable, matches the URL the user is looking at.
- **App segment** — sibling `githubRepos` rows (monorepo sub-apps) share one
  GitHub `owner`/`name`, but `numId` is allocated **per sibling repoId**
  (`allocateNumId(db, repoId, …)`). Without the segment, `web` #5 and `api` #5
  both produce `eva/session-5` and collide on the same remote. The segment also
  lets the PR webhook recover the exact sibling.
- **Automation keeps `runId`** — automation runs have no `numId`; the automation
  does, so `eva/<app>/automation-<automationNumId>-<runId>` stays unique per run.

### Rejected alternatives

- **Shared codebase-wide counter** (allocate `numId` against the canonical repo):
  removes the clash without an app segment, but changes the per-app numbering the
  user sees in URLs. Rejected — per-app numbering is desired.
- **Keep `_id` in branch**: no clash, but abandons the readability goal.
- **Reverse-lookup by a stored `branchName` index**: insufficient alone — with
  per-app `numId`, `branchName` is no longer globally unique across siblings, so
  the webhook still needs repo + app context.

## Shared helper (new)

Add one branch-prefix resolver so the app-segment rule lives in exactly one place.

```ts
// _githubRepos/helpers.ts (or a new _branches/helpers.ts)

/** Slugifies a rootDirectory into a single safe branch segment. */
function slugifyApp(rootDirectory: string): string {
  return rootDirectory.replace(/\//g, "-").toLowerCase();
}

/** Returns the `eva/` or `eva/<app>/` prefix for a repo's Eva branches. */
export async function resolveBranchPrefix(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<string> {
  const repo = await db.get(repoId);
  if (!repo?.rootDirectory) return "eva/";
  return `eva/${slugifyApp(repo.rootDirectory)}/`;
}
```

All builders become `${prefix}<entity>-<numId>`.

## Builder changes

| File / symbol                                                         | Before                                    | After                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `_sessions/mutations.ts:36`                                           | `eva/session-${sessionId}`                | `${prefix}session-${numId}` (numId already in scope, line 26)         |
| `_sessions/workflow.ts:84,268` (fallbacks)                            | `eva/session-${_id}`                      | prefix + `session-${session.numId}`                                   |
| `_sessions/sandbox.ts:70` (fallback)                                  | `eva/session-${_id}`                      | prefix + `session-${session.numId}`                                   |
| `_taskWorkflow/helpers.ts:25` `resolveTaskBranchName`                 | `eva/task-${task._id}`                    | `${prefix}task-${task.numId}`                                         |
| `_agentTasks/sandbox.ts:57,146`                                       | hand-built `eva/task-${taskId}`           | route through `resolveTaskBranchName` (kills duplicate format)        |
| `_taskWorkflow/queries.ts:206,366`                                    | hand-built `eva/task-${taskId}`           | route through `resolveTaskBranchName`                                 |
| `_projects/helpers.ts:13` `buildProjectBranchName`                    | `eva/project-${projectId}[-vN]`           | add `numId` param → `${prefix}project-${numId}[-vN]`                  |
| `_projects/*`, `_agentTasks/mutations.ts:634`, `githubWebhook.ts:262` | callers of `buildProjectBranchName`       | pass `project.numId` + prefix                                         |
| `_automations/helpers.ts:6` `buildAutomationRunBranchName`            | `eva/automation-${automationId}-${runId}` | add `automationNumId` param → `${prefix}automation-${numId}-${runId}` |
| `_automations/triggers.ts:44,116`                                     | callers                                   | pass `automation.numId`                                               |
| `_designSessions/sandbox.ts:44`                                       | `eva/design-${id}`                        | prefix + `design-${session.numId}`                                    |

`buildProjectBranchName` / `buildAutomationRunBranchName` are currently sync and
take only the entity id. They need the numId (and the resolved prefix). Either
make them async and pass `db`, or pass the pre-resolved `prefix` + `numId` from
the caller. **Prefer passing `prefix` + `numId`** so the builders stay pure and
the single DB read happens once at the call site.

## Webhook reconciliation (`githubWebhook.ts` + `http.ts`)

`findRunByBranchName` currently parses the branch suffix as a **global Convex
`_id`** via `ctx.db.normalizeId`. Per-app `numId` is not globally unique, so this
must resolve repo + app first.

1. **`http.ts:432`** — pass `repoOwner` / `repoName` (already on `payload["repository"]`,
   used at `http.ts:446`) into `handlePrClosed`.
2. **`handlePrClosed`** — accept `repoOwner` / `repoName`.
3. **`findRunByBranchName`** — rewrite to:
   - **Dual-parse (transition):**
     - **Old format** `eva/task-<convexId>` / `eva/project-<convexId>[-vN]`:
       keep the existing `normalizeId` path as the first attempt. Guarantees
       in-flight old-format PRs still reconcile. Remove in a later cleanup once
       no open old-format PRs remain.
     - **New format** `eva/[<app>/]<entity>-<numId>[-vN]`:
       1. Resolve candidate sibling repoIds via `githubRepos.by_owner_and_name`.
       2. Pick the sibling whose `rootDirectory` slug matches `<app>` (or the
          sibling with no `rootDirectory` when the segment is absent).
       3. Query `agentTasks` / `projects` via the existing
          `by_repo_and_numId` index.
   - Then find the latest `agentRun` as today.

No new schema index required — `by_repo_and_numId` and `by_owner_and_name`
already exist; every target table already has a `numId` field.

## Scope / edge cases

- **New entities only.** Existing rows keep their persisted `_id`-based
  `branchName`; no data migration.
- **In-flight old-format PRs** still reconcile via the retained old parser
  (dual-parse). Flagged for later removal.
- **Design-session / automation branches** are never reverse-parsed, so they are
  rename-only (no webhook work).
- **Collision safety:** `(owner, name, app-slug, numId)` is unique because
  `numId` is unique per sibling repoId and the app slug maps 1:1 to the sibling.

## Verification

- `cd packages/backend && npx convex codegen --typecheck enable`.
- No new `any` / `unknown` / `as` / `!`.
- Manual: create a session in a monorepo sub-app and in a single-app repo,
  confirm branch names; close an old-format PR and confirm it still reconciles.

## Open follow-ups

- Later cleanup PR: drop the old-format `normalizeId` parser once no open
  `eva/task-<convexId>` / `eva/project-<convexId>` PRs remain.
