# Pull requests (many per chat)

A session, quick task or project can hold several pull requests. Every one is a row in `pullRequests`; the owner holds a small summary of them.

## Data model

| Table / field | Purpose |
|---|---|
| `pullRequests` | One row per PR: `repoId`, `prUrl` (unique), `prNumber`, `headBranch`, `baseBranch`, `title`, `state`, `stateOnArchive`, `primary`, `origin`, `owner`. Indexes `by_pr_url`, `by_session` / `by_task` / `by_project` (on `owner.*`), `by_repo_and_head_branch`. |
| `owner` | `{ kind: "session", sessionId, sessionRepoId? }`, `{ kind: "task", taskId, runId? }` or `{ kind: "project", projectId, taskId?, runId? }`. A linked repo's PR names its `sessionRepos` row; a task or project PR names the run that opened it. |
| `primary` | The PR Eva's own flow opened for the owner's current branch. At most one per owner; a newer Eva PR demotes the old one. Drives Send for Review, title sync and draft/ready sync. |
| `origin` | `eva` when Eva's flow opened it, `agent` when it was attached from a webhook (the agent or a person opened it on an Eva branch). |
| `sessions/agentTasks/projects.prUrl, prState, prCount` | Summary, written only by `syncOwnerPrSummary`, so list rows need no join. `prUrl` is the primary (else the newest). `prState` stays live while any PR is live, then reads merged if any merged, else closed. With one PR it is exactly that PR. |

All writes go through `_pullRequests/store.ts`. Nothing else patches a PR row or a summary.

## How a PR gets linked

1. Eva's flows record their own PR: `createDraftSessionPr` / `createDraftSessionRepoPr` (sessions), `finalizeRunStatus` (task and project runs), the manual Create PR actions.
2. Every `pull_request` webhook lands in `githubWebhook.ts:handlePullRequestEvent`. An unknown URL is attached from its head branch: `eva/session-<id>`, `eva/task-<id>`, `eva/project-<id>[-vN]`, each optionally followed by `-<slug>`. The webhook's repository must match the owner's repo (or one of a session's linked repos), and a head from a fork is never attached.
3. The agent prompt tells the agent to open its own PRs from `<chat branch>-<slug>`, so they link back automatically.

## Lifecycle rules

- **Session:** archives when every PR it holds is terminal; a reopened PR brings it back. Archive closes every live PR and remembers each state; unarchive reopens exactly those.
- **Quick task:** moves to done when every PR is terminal and one merged, cancelled when all closed unmerged. Cancel closes every live PR; un-cancel reopens them.
- **Project:** draft/ready events on the primary PR move the review phase. Merging the PR of the current branch starts a new branch version. The project completes (or cancels) once every PR is terminal.
- Opening a PR or refreshing one is decided by `isFirstTaskOnBranch`: is there a live PR on the branch the run pushes to.

## UI

The sandbox Review pane has a Pull requests tab (`…/review/prs`) on all three chat surfaces. It lists every PR the chat holds; picking one points Summary, Timeline and Code at it (`?pr=<pullRequestId>`, else the primary). The "More" menu lists each PR when there is more than one.

## Migration

`npx convex run dataMigrations:backfillPullRequests` moves the old fields (`sessions.prUrl`, `sessionRepos.prUrl`, `projects.prUrl`, `agentRuns.prUrl`) into rows and asks GitHub for each PR's real state. Run it once per deployment, straight after the deploy. The deprecated source fields (`sessions.prStateOnArchive`, `sessionRepos.prUrl/prState`, `agentRuns.prUrl`) are cleared as rows move; dropping them from the schema is a follow-up once the backfill has run everywhere.
