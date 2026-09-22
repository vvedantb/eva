# Multi-repo sessions (codebase groups)

How a session spans several GitHub repos in one sandbox: where the checkouts live, how they are provisioned, how git auth works across installations, and what publishes. Companion to [`docs/sandbox-snapshot-lifecycle.md`](./sandbox-snapshot-lifecycle.md).

Design record: `plan.md` (sections 2.x). Where the code and the plan differ, this doc describes the code and flags the difference.

## Purpose

- One session, several connected repos, cloned side by side so the agent can read and edit across them.
- One **primary** repo keeps everything it owns today: the URL, `numId`, Vercel credentials, seeded snapshot, sandbox-wide env vars, startup commands, dev server, deployment tracking.
- Extra repos are **linked**: whole clones in the same sandbox, each on its own branch, each with its own optional PR.
- Saved **codebase groups** prefill the selection and give the group a seeded snapshot so fresh sandboxes skip the clone + install cost.

Monorepo "apps" (`rootDirectory`, `parentRepoId`) are not multi-repo — siblings share one checkout, and that machinery is untouched.

## Sandbox layout

```
/tmp/repo                       primary checkout (real dir, unchanged)
/tmp/workspace/                 shared folder the agent sees
/tmp/workspace/<primaryName> -> /tmp/repo        (symlink)
/tmp/workspace/<linkedName>/    full clone, one per linked repo
```

- Folder name is the GitHub repo `name`. Two members sharing a `name` are rejected at save/create time (`_repoGroups/validate.ts`) rather than renamed.
- The agent's cwd stays `/tmp/repo`, so plan.md, commit instructions, media scanning, PTY cwd and `WORK_DIR` keep working unchanged.
- Path source of truth: `_sandbox_runtime/workspaceLayout.ts` (`WORKSPACE_ROOT`, `PRIMARY_REPO_DIR`, `linkedRepoDir`, `primaryLinkPath`, `repoNameFromWorkspacePath`). It is pure and dependency-free, so isolate queries, workflows and node actions share one definition. Node-only modules use `helpers.ts:WORKSPACE_DIR`. Never add a new `/tmp/...` string literal.

## Data model

| Table / field | Purpose |
|---|---|
| `sessionRepos` (new) | One row per linked repo per session: `sessionId`, `repoId`, `owner`, `name`, `installationId`, `path`, `branchName`, `baseBranch`, `prUrl`, `prState`, `installDependencies`, `clonedAt`, `devPort`, `devCommand`. Indexes `by_session`, `by_repo`, `by_pr_url`. |
| `repoGroups` (new) | Saved selection: `name`, `createdBy`, `teamId`, `primaryRepoId`, `linkedRepoIds`, `installDependencies`, `seededSnapshotName`, `seededFingerprint`, `createdAt`, `updatedAt`. Indexes `by_created_by`, `by_team`. |
| `sessions.repoGroupId` | Provenance only. `sessionRepos` rows are the source of truth, so editing a group later never rewrites an existing session. |
| `sessions.linkedRepoCount` | Denormalised count, so sidebar rows and resume paths detect a multi-repo session without a join. |
| `sandboxGitCredentials.installationIds` | Every installation this sandbox may mint a token for. `installationId` stays the primary's; rows written before linked repos existed fall back to `[installationId]`. |
| `messages.beforeShas` / `afterShas` | Multi-repo turn checkpoints: `{ path, sha }` per checked-out repo. Supersede the scalar `beforeSha`/`afterSha`, which stay primary-only. |

A table (not an array on `sessions`) because Convex cannot index inside arrays, and the GitHub webhook must find a session from a linked PR URL.

Group visibility: `teamId` is copied from the primary repo at create time, so teammates of that repo's team see and can use the group. Otherwise it is creator-only. Access checks require the caller to have access to every member repo.

## Startup sequence and the `sandboxSetupPending` gate

`sessions.create` validates the selection (same pure rules as a saved group), inserts one `sessionRepos` row per linked repo — branch `eva/session-<id>` in every repo, base = each repo's `defaultBaseBranch` — sets `linkedRepoCount`, and starts `sessionSandboxStartupWorkflow` with `hasLinkedRepos`.

The workflow (`_sessions/workflow.ts`):

1. `internal.sandbox.startSessionSandbox` — primary sandbox as today. With `hasLinkedRepos`, `prepareSessionSandboxInternal` **arms** `sandboxSetupPending` and deliberately does not clear it.
2. One `internal.sandbox.prepareLinkedRepo` action **per linked repo**, sequentially (one action per repo keeps each inside Convex's 10-minute action ceiling). A failure posts a system alert naming that repo and provisioning continues with the rest.
3. `internal.sessions.clearSandboxSetupPending` — always, success or failure.

The gate is what `claimPendingTurn` waits on, so the first turn does not start until every linked repo has been attempted. A linked repo that never finishes cannot wedge the session forever.

`prepareLinkedRepo` (`_sandbox_runtime/linkedRepos.ts`), per row and idempotent:

1. `mkdir -p /tmp/workspace` and `ln -sfn /tmp/repo /tmp/workspace/<primaryName>`.
2. `ensureGitCredentialHelper` with the primary installation plus this row's.
3. No `.git` → clone, then check out `branchName` (from `origin/<branch>` when it already exists remotely, otherwise from `origin/<baseBranch>`). `.git` present (snapshot or resume) → `git fetch origin <baseBranch>` and check the session branch out.
4. `installDependencies` and no `node_modules` → detect the package manager, install Node deps, then Python deps.
5. Write this repo's `.env.eva` (see below).
6. Patch `clonedAt`.
7. Start this row's dev server when it has both `devCommand` and `devPort`.

Progress labels ("Cloning `<name>`…", "Installing `<name>` dependencies…") stream onto the session startup timeline.

**Resume.** Clones persist in the Vercel snapshot. A resume schedules `startSessionSandbox` directly and does **not** re-run `prepareLinkedRepo`; it only relaunches each cloned row's dev server (`_sandbox_runtime/sessions.ts`), skipping rows with no `clonedAt`. *Differs from plan 2.4, which called for a resume hook into the prepare step.* A resume that falls through to a fresh sandbox therefore relies on the group snapshot, or on the branch already being pushed — uncommitted local work in a linked repo is lost exactly as it is for the primary today.

Orchestrator (Manager Ave) sessions never have linked repos and skip the step.

## Git auth across installations

Linked repos may sit under a different GitHub App installation than the primary.

- `ensureGitCredentialHelper(ctx, sandbox, primaryInstallationId, extraInstallationIds)` writes the union to `sandboxGitCredentials.installationIds`.
- The in-sandbox helper sets `git config --global credential.useHttpPath true`, reads `path=` from git's stdin, sanitises it, and POSTs `{ "path": "<owner>/<name>.git" }` to `/api/git-credentials`.
- The route (`http.ts`) parses the path, looks the repo's `installationId` up by owner/name, and mints only when that id is in the sandbox's allow-list — otherwise **403**. A request with no path (old helper scripts baked into snapshots) falls back to the primary installation. Pure decisions live in `_sandbox_runtime/gitCredentialsPath.ts`.
- The helper's token cache file is keyed by a hash of the repository path (`/tmp/git-cred-cache-<hash>`), so a cache hit for one repo can never serve another repo's token. Installing the helper wipes stale cache files.

Single-installation groups need none of this at runtime; the allow-list is what makes cross-org groups safe.

## Agent runtime

`launch.ts` adds, only when the session has linked repos (`buildLinkedReposEnv`, `_sandbox_runtime/linkedReposEnv.ts`):

| Env var | Value |
|---|---|
| `EVA_WORKSPACE_ROOT` | `/tmp/workspace` |
| `EVA_LINKED_REPOS` | JSON array of `{ owner, name, path, branchName, baseBranch }` |
| `EVA_LINKED_REPOS_CWD_ROOT` | Not set by Eva. Operator escape hatch, see below. |

`callback-src/config.ts` parses them into `WORKSPACE_ROOT` (null for single-repo), `LINKED_REPOS` (empty for single-repo), `REPO_CHECKOUT_DIRS` (primary first, then linked paths) and `AGENT_CWD`. Malformed `EVA_LINKED_REPOS` is logged and ignored — the session runs single-repo rather than failing.

Per harness:

| Harness | Behaviour |
|---|---|
| Claude | `additionalDirectories: [WORKSPACE_ROOT]` in `claudeSdk.ts`. The SDK's file tools refuse paths outside cwd plus additional dirs, so this is required. |
| Codex | Already unconfined (`approvalPolicy: "never"`, external sandbox / full access). No change beyond the prompt. |
| Cursor | `local.cwd = AGENT_CWD`. No documented extra-directories option; most likely to need the fallback. |
| OpenCode | Client `directory` and spawned server `cwd` both `AGENT_CWD`. Same caveat as Cursor. |

**`EVA_LINKED_REPOS_CWD_ROOT=1` fallback.** `resolveAgentCwd(workDir, workspaceRoot, useRoot)` returns `WORKSPACE_ROOT` instead of `WORK_DIR` when the flag is set and a workspace root exists. Every linked repo, plus the primary via its symlink, then sits inside the harness's cwd. Pure env flag: no callback rebuild, togglable per session.

**Manual smoke test.** `packages/backend/callback-src/tests/linkedReposHarness.manual.md`. Automated tests cover the pure config decisions (`linkedReposConfig.test.ts`) and the checkpoint shas (`turnCheckpoint.test.ts`); no test can prove a given SDK version will write outside its cwd. Run the manual test after touching any provider file or upgrading any of those SDKs: ask for a one-line commit in the linked repo without mentioning paths, and check the linked clone's HEAD moved. **Still to run.**

**Prompt.** `buildLinkedReposSection` (`convex/prompts/shared.ts`) adds a `## Linked repositories` block listing every repo with its path, branch and base; it tells the agent to `cd <path>` before committing, to source that repo's `.env.eva` before running its commands, never to push, and to keep `plan.md`, `screenshots/` and `recordings/` in `/tmp/repo`. Single-repo sessions get an empty string.

## Publish, PRs and archive

- Primary: unchanged. The turn workflow pushes the primary branch, then opens or updates its draft PR.
- Linked: `internal.sandbox.pushLinkedRepoBranches` fetches each row's base, counts `origin/<base>..<branch>`, and pushes only when that is greater than 0. Missing clone directories and per-repo push failures are logged and skipped, so one repo cannot fail the whole publish. `internal.github.createDraftSessionRepoPr` opens one draft PR per row, idempotently, with a body that cross-links every sibling PR already known plus the Eva session URL, and stores `prUrl`/`prState` on the row.
- **Gap:** both actions are implemented and exported (`sandbox.ts`, `github.ts`) but **nothing calls them** — `sessionExecuteWorkflow` still only pushes the primary and opens the primary's PR. Until they are wired in, linked-repo commits stay in the sandbox. *This is the one part of plan 2.7 that is not live.*
- Webhook (`githubWebhook.ts`): a PR URL that matches no session falls back to `sessionRepos.by_pr_url` and updates `prState` there. Both paths then run one reconcile.
- Archive rule (`_sessions/prArchive.ts:shouldArchiveSession`): archive when **every** PR the session opened (primary plus linked) is `merged` or `closed`. Rows that never opened a PR are ignored; if no PR exists at all the session does not archive. Unarchive is the same rule inverted, so a reopened linked PR brings the session back.
- Sandbox deletion and the 48h grace are unchanged — one sandbox per session.
- Deployment tracking stays primary-only on purpose: the primary owns the Vercel project.

## Env files (`.env.eva`)

The sandbox-wide env file keeps carrying team vars plus the **primary** repo's `repoEnvVars`. Merging linked repos into it is unsafe — two repos can define the same key with different values.

Instead `prepareLinkedRepo` resolves that repo's vars (`resolveEnvVars`, which is team vars plus repo vars, both filtered by the existing `getForSandbox` sandbox-eligibility rules), formats them (`envFile.ts:formatEnvFile`) and writes `<path>/.env.eva` at mode 600. Nothing is written when the repo has no eligible vars.

Consumers: the prompt tells the agent to `set -a && . ./.env.eva && set +a` before running that repo's commands, and the linked dev server launcher sources it automatically when present.

## Dev servers

- Primary: unchanged. Its `devCommand`/`devPort` auto-start into the Preview Console.
- Linked: only when the `sessionRepos` row carries an explicit `devCommand` and `devPort` — there is no framework auto-detection for linked repos. `launchLinkedRepoDevServerInVercelConsole` starts it in its own tmux session keyed `session-<id>-<repoName>`, sourcing that repo's `.env.eva` first.
- Started from `prepareLinkedRepo` on create (the earliest point the clone exists) and from the resume path for rows that already have `clonedAt`.
- **Ports:** the sandbox still exposes only the fixed `VERCEL_DEFAULT_EXPOSED_PORTS` set (`3000, 8080, 6080, 54321`). A linked repo's `devPort` must be one of those to be reachable. *Differs from plan 2.10, which called for passing the union of linked ports at sandbox create.*

## Group snapshots

Fresh sandboxes otherwise clone and install every linked repo. A saved group gets its own seeded snapshot so that cost is paid once.

- **Build** (`_repoGroups/snapshotBuild.ts:buildGroupSnapshot`, a `"use node"` action): boot an ephemeral sandbox from the **primary's** own seeded snapshot, create the workspace root and the primary symlink, clone every linked repo on its `defaultBaseBranch`, install its deps, capture one snapshot, store it on the group.
  - Skipped entirely when the primary has no seeded snapshot yet.
  - Dependency installs are skipped when a group has more than 3 linked repos, to stay inside the action ceiling; the snapshot still carries the clones.
  - Clone tokens are one-off and stripped from `origin` before capture, so no token is baked into the snapshot.
  - Best-effort: any failure is logged and leaves the previous good `seededSnapshotName`/`seededFingerprint` in place. The builder sandbox is always deleted.
- **Naming:** snapshot label `group-<groupId>-<first 12 chars of fingerprint>`; the resulting `snap_*` id is what lands in `seededSnapshotName`.
- **Fingerprint** (`_repoGroups/snapshot.ts:computeRepoGroupFingerprint`): djb2 over the primary's seeded snapshot name, the sorted linked members (`repoId` plus the branch each clones), and the install flag. Member order does not matter. Same djb2 approach as `_repoSnapshots/config.ts`.
- **Invalidation:** `repoGroups.update` clears the snapshot and schedules a rebuild when membership or the install flag actually changes (a rename alone does not). `repoGroups.create` schedules a build immediately; `repoGroups.rebuildSnapshot` forces one. Builds are asynchronous and no-op when the fingerprint already matches.
- **Boot:** `resolveSandboxContext(ctx, repoId, { repoGroupId })` prefers `getGroupSnapshotForBoot`, which re-hashes the current inputs and returns the group snapshot only when the fingerprint still matches, a member repo has not been deleted, and the primary still has its own seeded snapshot. Otherwise the plain per-repo snapshot is used and the clone step does the work. Ad-hoc (unsaved) selections always clone.
- **Purge protection:** group snapshot names are included in the protection lists used by `snapshotActions.purgeUnreferencedVercelSnapshots*` and by `bulkSnapshotRetention.ts`, so the orphan purge never deletes a live group snapshot. `repoGroups.remove` schedules `deleteSeededSnapshot` for the group's own snapshot.

## Turn checkpoints and revert

- `callback-src/runtime/turnCheckpoint.ts` reads HEAD for every entry in `REPO_CHECKOUT_DIRS` at turn start and after `persistTurnWork`, and sends `beforeShas`/`afterShas` alongside the primary-only scalars (so an older Convex deployment keeps working). Unreadable directories are skipped. Sessions only.
- `_sandbox_runtime/turnRevert.ts:revertTargets` prefers `beforeShas` and falls back to the scalar `beforeSha` for pre-multi-repo turns and single-repo sessions.
- The revert is all-or-nothing: every target sha is verified (fetched if the clone is shallow) before any repo is touched, so repos never end up on mismatched turns. Restores are new commits on each session branch; history is never rewritten.
- Force-push recovery (`performForcePushBranch`) takes an optional `sessionRepoId` and force-pushes that linked clone instead of the primary.
- Repo deletion (`_migrations/deleteRepos.ts`) cascades `sessionRepos` rows, decrements `sessions.linkedRepoCount`, and scans `repoGroups` to drop the repo from `linkedRepoIds` or delete groups whose primary it was.

## UI

- **Composer:** `CodebasesPicker` — primary chip from the URL repo (non-removable) plus removable linked chips, an "Add codebase" popover deduped by `owner/name`, and a saved-groups section with save/rename/delete. Selection lives in the URL via nuqs (`linked`, `group`, `deps`), so it survives reloads and is shareable.
- **Session header:** `SessionRepoBadges`, from `sessions.listRepos` — one row per repo (`kind: "primary" | "linked"`, path, branch, PR URL and state), primary first.
- **Files panel:** root selector once a session has linked repos; the primary's root is stored as `""` in the URL.
- **Changed files:** paths under `/tmp/workspace/<name>/` are attributed to that repo and grouped under a heading (`changedFilesPresentation.ts`).
- **Sidebar:** a `+N` badge from `linkedRepoCount` on the primary's row, and the session also appears under each linked repo with a "via `<primary>`" hint linking back to the primary's URL (`linkedFrom`).
- **Terminal / PTY:** cwd stays `/tmp/repo`.

## MCP

- `create_session` gains `linkedRepos?: string[]` (same `name` / `owner/name` grammar as `repoName`) and `group?: string` (saved group name). They are mutually exclusive, and a named group's saved primary must match `repoName` — the error names the primary to pass instead. Unknown or ambiguous group names are rejected with the caller's group list. The result includes the resolved `linkedRepos` (`repo`, `path`).
- `list_repos` returns saved groups alongside repos, so a caller can discover a `group` name. Groups whose primary repo has been deleted are dropped.
- `get_agent_state` and `list_entities` include a session's `linkedRepos` with `repo`, `path`, `branch`, `prUrl` and `prState`.
- `create_task`, projects and automations stay single-repo.

## Key files

| Area | Path |
|---|---|
| Sandbox paths (isolate-safe) | `_sandbox_runtime/workspaceLayout.ts` |
| Sandbox paths (node) | `_sandbox_runtime/helpers.ts` (`WORKSPACE_DIR`) |
| Clone / install / env / dev server per repo | `_sandbox_runtime/linkedRepos.ts`, `_sandbox_runtime/linkedRepoBranch.ts` |
| Startup workflow + gate | `_sessions/workflow.ts`, `_sandbox_runtime/sessions.ts` |
| Session repo rows + queries | `_sessions/repos.ts`, `_sessions/mutations.ts` |
| Groups (CRUD, access, rules) | `repoGroups.ts`, `_repoGroups/validate.ts` |
| Group snapshots | `_repoGroups/snapshot.ts`, `_repoGroups/snapshotBuild.ts` |
| Snapshot preference at boot | `_sandbox_runtime/helpers.ts` (`resolveSandboxContext`) |
| Git auth | `_sandbox_runtime/gitCredentials.ts`, `_sandbox_runtime/gitCredentialsPath.ts`, `http.ts` |
| Launch env | `_sandbox_runtime/launch.ts`, `_sandbox_runtime/linkedReposEnv.ts` |
| Agent runtime config | `callback-src/config.ts`, `callback-src/linkedRepos.ts`, `callback-src/providers/*` |
| Prompt block | `convex/prompts/shared.ts` (`buildLinkedReposSection`) |
| Publish (not yet wired) | `_sandbox_runtime/execution.ts` (`pushLinkedRepoBranches`), `_github/prFlow.ts` (`createDraftSessionRepoPr`) |
| PR state + archive | `githubWebhook.ts`, `_sessions/prArchive.ts` |
| Checkpoints / revert | `callback-src/runtime/turnCheckpoint.ts`, `_sandbox_runtime/turnRevert.ts` |
| Repo deletion cascade | `_migrations/deleteRepos.ts` |
| Composer / header / files UI | `apps/web/src/routes/_repo/$owner/$repo/sessions/_components/CodebasesPicker.tsx`, `SessionRepoBadges.tsx`, `../FilesPanel.tsx` |
| Manual harness test | `callback-src/tests/linkedReposHarness.manual.md` |

Tests: `packages/backend/tests/` — `workspaceLayout`, `linkedRepos`, `linkedReposEnv`, `linkedReposPrompt`, `gitCredentialsPath`, `prArchiveRule`, `repoGroupFingerprint`, `repoGroupsValidate`, `turnCheckpointCompletionContract`; `callback-src/tests/` — `linkedReposConfig`, `turnCheckpoint`; `apps/web` — `changedFilesPresentation`.
