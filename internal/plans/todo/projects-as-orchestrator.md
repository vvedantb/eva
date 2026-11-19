# Projects as orchestrator (coordinator chat + parallel child tasks)

**Date:** 2026-11-19
**Status:** TODO. No code written. Decisions below are agreed with the user (session 405 chat log).
**Related:** session 422 "Convert sessions to projects with feedback tasks" (this plan replaces its build change and keeps its promote + feedback ideas). `internal/sessions-vs-projects.md`, `internal/conductor.md`.
**Supersedes:** root `chat-in-sandbox-for-projects-and-tasks.md` (delete it in step 0).

## Goal

Big work does not fit in one session or one quick task. A project becomes the place that holds it:

- **Sessions:** the user drives. Single, or siblings in a session group.
- **Quick tasks:** one-off jobs. Single only.
- **Projects:** an agent drives. One **coordinator chat** plans and maintains the project. It never edits code. It creates **child tasks** for every phase. Each child task runs like a quick task: its own sandbox, its own branch, its own PR to main.

The business team opens the project and sees what is launched, what is in progress and what is still todo.

## Agreed decisions

| # | Decision | Reason |
|---|---|---|
| 1 | The coordinator chats and creates tasks. No interview step, no plan step. | One conversation, not two that do not know each other. |
| 2 | Child tasks run in parallel and follow `taskDependencies`. | The dependency table exists but the build ignores it today. |
| 3 | Each child task has its own sandbox, branch and PR **straight to main**. No project branch, no phase branch. | Amp's model. Merged means launched. No long-lived branch to drift. One review for each task. |
| 4 | Phases are labels that group tasks for status. They are not branches. | Follows from 3. |
| 5 | A child task rebases and fixes its own merge conflicts. | It knows its own change. The coordinator stays read-only. |
| 6 | The coordinator sandbox is read-only. | Keeps the main thread free and cheap. |
| 7 | The coordinator proposes a batch of tasks as `todo`. The user approves the batch once. After that the scheduler starts each task when its dependencies are done. | One check from a person before money is spent. Cancel a `todo` task to reject it (from 422). |
| 8 | A person merges each PR. The coordinator never merges in v1. | No unreviewed agent code on main. |
| 9 | At most **3** child tasks run at the same time in one project. Hard-coded constant in v1. | 5 parallel agents cost about 5 times one agent (Cursor docs, cited in the eesel.ai review of 11 September 2026). |
| 10 | Old projects are converted in place. | One code path. History is kept. |
| 11 | Project context reuses Documents, Artifacts and the chat Log. No new store. | They already carry `chatSourceFields`. |
| 12 | Roles come from the user's existing Eva role (`users.role`: `dev`, `designer`, `business`). **Devs are Contributors. Everyone else is a Viewer.** No role setting for each project. Viewers read everything and can file a feedback task. Contributors can chat and run tasks. | The user asked for the simplest rule. Business team can report without starting agent runs. |
| 13 | A project has a home repo plus a list of extra repos. Each child task targets exactly **one** repo and opens its PR there. A dependency can cross repos. | Real case: a carepulse-ts project that needs a change in carepulse_v2. Cheap, because each task already has its own session and `agentTasks.repoId`. Amp does the same: its Space agent starts a thread "in the project you named" (Amp docs, "Spaces", read 19 November 2026). |
| 14 | Hub model with a read-only view. Child tasks never message each other. A task can read sibling status and docs, and can report to the coordinator. The coordinator can message any child task. | Easy to follow, cannot loop. Amp documents the same shape: threads report to the Space, no thread-to-thread chat, files move only when asked (Amp docs, "Spaces" and "Agent to Agent", read 19 November 2026). |
| 15 | No parallel tool set. Reuse and extend the existing MCP tools; add only the tools listed in step 3. | The fleet tools (`mcp/orchestratorTools.ts`) and task tools already cover most needs. |
| 16 | The coordinator wakes by itself only when it has a job: a child's ask (at once), a failed task, the end of an approved batch. Not for each finished task or merged PR. Cap: 10 automatic turns an hour for each project. | Starting the next task is plain code (the scheduler) and needs no agent turn. Keeps the idle cost of a project low. Amp's docs do not say when a Space agent wakes. |
| 17 | The coordinator may retry a failed task once, with a note on what went wrong. A second failure shows "needs you". | Unblocks work while people are away, with a hard limit on spend. Amp's docs do not cover retries. |
| 18 | A Contributor can chat directly in a child task. This does not wake the coordinator. | Same as a quick task today. Amp allows the same (open a thread beside the Space chat). |
| 19 | A project has no archive and no close action. It shows **done** when every task is launched or cancelled, and it opens again when a task is added. | Status is derived (see Target model), so this needs no stored state. |

## Scope

**v1 (this plan)**

1. Coordinator chat that creates and maintains tasks.
2. Parallel child tasks, each with its own sandbox, branch and PR to main.
3. Live task cards in the coordinator chat, with a "needs you" state.
4. Project summary document (the "ledger") that the coordinator keeps up to date.
5. Docs, artifacts and log rolled up across the project.
6. Project instructions that go into every child task prompt.
7. Viewer and Contributor roles. Viewers can file feedback tasks.
8. Comments on coordinator messages that do not wake the coordinator.
9. Adopt an existing session into a project (see the risk note in step 8; this is the first item to move to v2 if it is hard).
10. Conversion of old projects.
11. Cross-repo projects: one repo for each child task (decision 13).
12. Hub awareness between the coordinator and child tasks (decision 14).

**v2 and v3:** see `projects-as-orchestrator-v2-v3.md` (outline only; research again when each stage starts).

## Current state (main at `03eb256a1`, verified 2026-11-19)

Paths are under `packages/backend/convex/` unless they show a full path.

- **One session for the whole project.** `workSessionOwner` (`_sessions/owner.ts:68`) sends a project and all of its tasks to the project's hidden session. Only a quick task owns its own session. This is the rule this plan reverses.
- **Project task chats** are `sessionChats` rows with `taskId`, inside the project session (`ensureTaskChat`, `_sessions/ownedSession.ts:141`).
- **One agent for each sandbox** (`ownedSessionBusy`, `ownedSession.ts:278`), so project tasks cannot run in parallel today.
- **Build is a strict queue.** `buildProjectWorkflow` (`buildWorkflow.ts:67`) runs `todo` tasks in `taskNumber` order, one at a time, and stops at the first failure. It does not read `taskDependencies`.
- **PR ownership.** A project has one PR on one project branch. `resolvePrOwnerFromBranch` (`_pullRequests/store.ts:484`) gives no owner for a project task, because a project task never pushes its own branch. `rotateProjectBranch` (`ownedSession.ts:325`) moves the project to a new branch after a merge.
- **`phase` has many writers:** `recomputeProjectPhase` / `applyPhaseTransition` (`functions.ts`), `githubWebhook.ts`, `_projects/mutations.ts`, `_projects/development.ts`, `_agentTasks/mutations.ts` (`createBatchWithDependencies`), `projectInterviewWorkflow.ts`.
- **Two transcripts.** `projectInterviewWorkflow` / `projectSpecWorkflow` write `projectDetails.conversationHistory` and `generatedSpec`. The project chat is the session Main chat. `buildSessionPrompt` / `ownerPromptContext` (`_sessions/sessionPrompt.ts`) give the project chat the title, description and spec only. No task list, no transcript.
- **Docs, artifacts, log.** `listRowsForChatSource` (`_chatSource/helpers.ts:299`) matches exactly one source. A project task's rows are filed under the task. The project tab does not show them.
- **Access.** `getProjectWithAccess` (`functions.ts`) checks repo access only. `projects.members`, `projectLead` and `codeReviewer` are display data.
- **MCP.** Sandbox tokens for an owned session carry the hidden session's identity (`_sandbox_runtime/helpers.ts:763-771`), so a tool cannot find "my project" without an id. `create_tasks_batch` (`mcp/tools.ts:801`) can only create a new project. The build tools are in `mcp/workTools.ts`.
- **Cards in chat.** `ChatBody.tsx` places inline cards by message with `placeChatUiPanels` (`SessionProposalCard`, `ChatArtifactCard`, `GenerativeUiPanel`, and others). Task cards copy this pattern.
- **Comments.** `messages` has no thread field. Threaded comments exist on tasks (`taskComments.parentId`) and docs (`docComments`).
- **Mobile** has project screens (`apps/mobile/app/project/[projectId].tsx`, `apps/mobile/src/projects/*`).

- **Fleet tools already exist** in `mcp/orchestratorTools.ts`: `list_agents`, `get_agent_state`, `stop_agent`, `create_session`, `watch_agent`, `unwatch_agent`, and `send_agent_message` (only for Manager Ave). `watch_agent` wakes a Manager Ave thread when an agent finishes; it cannot wake any other chat today. `send_chat_message` is in `mcp/tools.ts:920`.
- **Repo scope.** `projects.repoId` is required and single. `agentTasks.repoId` is optional and separate. A sandbox MCP token is pinned to one repo; the fleet tools skip that pin and rely on the user's `hasRepoAccess`.

Not verified: the claim that MCP calls from a project chat resolve to the hidden session comes from reading the code, not from a test. Check it in step 2.

## Target model

```
project
 ├─ coordinator session   owner: {kind:"project"}   read-only sandbox, Main chat only
 ├─ summary doc           docs row, sourceProjectId, kind "project_summary"
 ├─ instructions          projects.instructions (text)
 └─ child tasks           agentTasks.projectId
      └─ each: own session  owner: {kind:"task"}  own sandbox, branch eva/task-<id>, own PR to main
```

- **A child task is a quick task with a `projectId`.** It uses the same session, sandbox, chat, PR and review code as a quick task. The only differences: the scheduler starts it, and its prompt gets project context.
- **Project status is derived, not stored.** It is computed from child task statuses and their PR states:
  - `launched`: task `done` and its PR merged to main.
  - `in review`: `code_review` or `business_review`.
  - `in progress`: `in_progress`.
  - `todo`: `todo` (approved or not) and `draft`.
  - A task card shows **needs you** when the task waits for an answer, a review, a batch approval, or has failed.
- **Phase label:** `agentTasks.phaseLabel` (optional string) plus an ordered `projects.phaseLabels` list. Grouping only.

## Steps

Each step ends in a state that works and can ship alone. Every step: no `any`/`unknown`/`as`/`!`; shared logic in `@eva/shared`; web and mobile both updated; old Convex function names and args kept until the newest APK no longer calls them (`scripts/check-apk-compat.sh`).

### Step 0 — Clean the ground

1. Delete root `chat-in-sandbox-for-projects-and-tasks.md` (superseded).
2. Move this file's status to IN PROGRESS.

### Step 1 — A child task owns its own session

This is the core change. Do it alone, with no UI change.

1. Change `workSessionOwner` so that a task always returns `{kind:"task", taskId}`. A project target still returns `{kind:"project"}` (the coordinator session).
2. Remove `ensureTaskChat`'s project branch: a task chat is always the Main chat of the task's own session. Remove `findProjectTaskChat` and the `sessionChats.taskId` path after the migration in step 9.
3. `ownedSessionSeed`: every task gets `eva/task-<id>` and base branch = the repo default branch. Remove `resolveProjectBranchName` / `resolveProjectBaseBranch` use from task runs, and remove `rotateProjectBranch`.
4. `resolvePrOwnerFromBranch`: a project task's branch now resolves to the task, same as a quick task. `ensureTaskChatPr` covers project tasks.
5. Delete the `if (task.projectId)` branches that only existed to borrow the project's branch, sandbox or PR (`_taskWorkflow/*`, `_agentTasks/mutations.ts`, `_sandbox_runtime/*`, `mcp/*`). Count them before and after; report the number.
6. The project PR summary fields on `projects` stop being written. Remove them in step 9.

**Check:** run two tasks of one project by hand at the same time. Each has its own sandbox and its own PR to main.

### Step 2 — Scheduler replaces the build queue

1. Replace `buildProjectWorkflow` with a small scheduler mutation, `scheduleReadyTasks(projectId)`:
   - ready = status `todo`, approved (see 3), and every `taskDependencies.dependsOnId` task is `done`;
   - start ready tasks in `taskNumber` order until `MAX_PARALLEL_PROJECT_TASKS = 3` are `in_progress`;
   - a failed task is flagged and does not stop the others (422's decision). Tasks that depend on it wait;
   - retry (decision 17): add `agentTasks.coordinatorRetries` (number). The coordinator may restart a failed task while the count is 0; the restart sets it to 1. A second failure shows "needs you". A person's restart does not use the count. A retry is a new turn in the same task session, on the same branch.
2. Call it from three events only: batch approval, a task status change, a child PR merge (webhook). It is idempotent: a second call with the same state starts nothing.
3. Approval: add `agentTasks.approvedAt` (optional number). `approveProjectTasks(projectId, taskIds)` sets it. Tasks a person creates by hand are approved at creation.
4. A dependency is "done" when the task is `done` **and its PR is merged**, so the next task starts from a main that has the change.
5. Keep `start_project_build` / `cancel_project_build` MCP names and the old Convex function names as thin wrappers (approve all `todo` and schedule; cancel all not started) until the APK check allows removal.
6. Remove `projects.build` state after the wrappers no longer need it.

**Check:** a project with A, B (depends on A), C. Approve all. A and C start together. B starts after A's PR merges. Fail C; A and B still finish.

### Step 3 — Coordinator chat

1. The coordinator is the Main chat of the project-owned session. No other chat can be opened there (already true: `assertStandaloneSession`).
2. **Read-only.** The coordinator prompt says it must not edit code. Enforce it too: the project session does not own PRs (`ownsPullRequests` is already false) and gets no push credential. Decide in implementation whether `sandboxGitCredentials` can mint a read-only token; if not, block `git push` in the helper for project-owned sessions. Do not rely on the prompt alone.
3. **Identity.** Make MCP calls from the coordinator resolve to the project (`mcp/entityRef.ts` `withSelfDefault` / `resolveChat`), through `chatOwner`. First confirm the hidden-session behaviour noted above.
4. **Tools** (decision 15). The full list is below. No `start` tool: approval is a person's action (decision 7).

   | Tool | Caller | Change |
   |---|---|---|
   | `create_tasks_batch` | coordinator | **Extend:** accept "this project", `dependsOn`, `phaseLabel`, `repo`. Tasks are created `todo`, not approved. |
   | `create_task` | coordinator | **Extend:** same new args. |
   | `update_task`, `delete_task` | coordinator | **Extend:** default to the caller's project. Delete still needs the user's yes. |
   | `list_agents`, `get_agent_state` | coordinator, child task | **Extend:** a "this project" scope that returns the project's tasks with status, phase, repo, PR state and dependencies. A child task gets the same read-only view (decision 14). |
   | `stop_agent` | coordinator | **Reuse.** |
   | `send_chat_message` | coordinator | **Reuse** to message a child task. Scope it: a coordinator can only message tasks of its own project. |
   | `get_eva_doc`, `list_eva_docs`, `list_artifacts`, `read_chat_log` | coordinator, child task | **Extend:** project roll-up scope (step 6). Read-only for siblings' rows. |
   | `update_project_summary` | coordinator | **New** (step 5). |
   | `report_to_coordinator` | child task | **New.** One tool, `kind: "report" \| "ask"`. A report sends a finding or a status note and does not stop the task. An ask sends a question and ends the task's turn (see step 6.6). Both show on that task's row in the coordinator chat. |
   | `start_project_build`, `cancel_project_build`, `schedule_project_build` | any | **Keep as wrappers** until the APK check allows removal (step 2.5). |
   | `update_plan`, `mark_plan_implemented` | — | **No change.** Sessions only. Refuse them in a project chat with a clear error. |

   A child task must not get: `create_tasks_batch` for its project, `send_chat_message` to a sibling, `stop_agent`, or any write to a sibling's rows. Enforce this in the tool registry by `chatOwner`, not in the prompt.
5. **Prompt context** in `ownerPromptContext`: project title, description, instructions, the summary doc, and a compact task table (number, title, status, phase, PR state, dependencies). Cap the table size; state the cap in code.
6. **Wake-ups (decision 16).** The coordinator gets a short synthetic turn only for these events:
   - a child's **ask**: at once;
   - a child task **failed**: batched (one turn for events inside a short window);
   - **end of an approved batch** (every task in it is launched, cancelled, or failed twice): one turn to update the summary and propose the next batch.

   It does **not** wake for each finished task, each merged PR, a child's plain report, a person's message in a child task, or a new feedback task. It reads all of those at its next turn, from the task table and the open reports. Cap: `MAX_COORDINATOR_AUTO_TURNS_PER_HOUR = 10` for each project; when the cap is hit, the project shows "needs you" and waits for a person. A person's message never counts against the cap. The summary doc can therefore be stale between wake-ups; the counts shown above it come from live data (step 5.4). First check whether the `watch_agent` wake path (today: Manager Ave threads only) can wake a project coordinator; extend it instead of building a second one. Also read `internal/plans/todo/session-synthetic-turns.md`.
7. Remove `projectInterviewWorkflow`, `projectSpecWorkflow`, `projects.interview`, `planningMode`, `_projects/development.ts`, and the duplicate `projects.addMessage` — after step 9 converts the data.

**Check:** in a new project, ask the coordinator for a feature. It proposes tasks. Nothing runs until approval.

### Step 3b — Cross-repo child tasks (decision 13)

1. Add `projects.extraRepoIds` (list of `githubRepos` ids). `projects.repoId` stays as the home repo: it sets the project's URL, number and place in the sidebar.
2. A contributor adds or removes extra repos in project settings. A person can add only a repo they have access to. The coordinator cannot add a repo; it asks the user.
3. `create_task` / `create_tasks_batch` take `repo`. Default = home repo. Refuse a repo that is not on the project's list.
4. The child task's session, sandbox, snapshot, env vars, start-up commands, branch and PR all come from **its own** repo, exactly like a quick task in that repo. No project value overrides them.
5. Access: a user sees a child task only with access to that task's repo (`hasTaskAccess`). In the project view, a task in a repo the viewer cannot access shows as a locked row with title hidden. Derived project status still counts it.
6. Dependencies across repos work with rule 2.4 unchanged: "done" means the PR merged in its own repo. Note the limit in the UI text of the dependency: merged is not deployed. A task that needs the other repo's change **live** must say so; the coordinator then asks a person to confirm the deploy before it approves that task. No deploy detection in v1.
7. Coordinator sandbox: it clones the home repo only. For another repo it reads through the child task's results, PR diff and docs. Reading extra repos in the coordinator sandbox (the `sessionRepos` linked-repo path) is v2.
8. Different GitHub App installations: resolve the installation from the task's repo, never from the project. Check `startTaskRun` and the scheduler for any `installationId` passed down from the project (today `buildProjectWorkflow` takes one `installationId` for the whole build).
9. Project instructions apply to every child task. Repo `systemPrompt` and repo memory come from the task's own repo.
10. **Not in v1:** one task that edits two repos in one sandbox; adopting a session that has linked repos; session groups in projects.

**Check:** a project in repo A with extra repo B. Task 1 in B, task 2 in A depends on 1. Task 2 starts only after task 1's PR merges in B.

### Step 4 — Live task cards in the coordinator chat

1. Backing rows: a `create_tasks_batch` call records the message it belongs to and its task ids (new table `projectTaskBatches {projectId, messageId, taskIds, approvedAt?}`, listed by project).
2. Web: `ProjectTaskBatchCard` placed with `placeChatUiPanels` in `ChatBody.tsx`. One row for each task: number, title, live status, PR link, "needs you". One **Approve** action for the batch, and cancel for each task.
3. A click on a task opens it beside the chat (the existing task pane in the project route).
4. Mobile: the same card in the shared chat body; status logic in `@eva/shared`.
5. **Visual decisions are open.** Reuse the row style of `SessionProposalCard` and the existing task status badges. Ask the user before any new icon, colour or wording.

### Step 5 — Summary document (ledger)

1. One `docs` row for each project, marked as the project summary (add a `kind` or a `projects.summaryDocId`; pick the one that needs no second source of truth — prefer `projects.summaryDocId`).
2. `update_project_summary` MCP tool replaces or patches it. Sections the prompt asks for: goal, launched, in progress, next, decisions, risks.
3. It is the first tab or the top item of the project's Documents tab. It is also the text the business team reads.
4. The coordinator updates it on the wake-ups in step 3.6. Task counts inside it must come from the derived status, not from the agent's memory: render the counts from data above the doc body.

### Step 6 — Shared context roll-up

1. `listRowsForChatSource`: add a project roll-up mode that returns rows with `sourceProjectId` **plus** rows of every child task (`sourceTaskId` in the project's tasks). Do not copy rows. If the fan-out reads too much, write `sourceProjectId` on rows a child task creates, and backfill; choose after measuring with a project of about 50 tasks.
2. Project Documents and Artifacts tabs and the Log use the roll-up. Each row shows which task made it.
3. A child task's own tabs still show only its rows, plus a link to the project summary.
4. `projects.instructions` (text): edited in project settings; added to every child task prompt and the coordinator prompt through `ownerPromptContext`.
5. Child task prompt gets: project title, instructions, the summary doc, its own task text, and the titles of the tasks it depends on with their PR links.
6. **Awareness (decision 14).**
   - **Pushed at start:** the items in 5. They are a snapshot from the moment the task starts.
   - **Pulled on demand:** sibling status, sibling docs and artifacts, the current summary doc (tools in step 3.4). Read-only.
   - **Up to the coordinator, report:** `report_to_coordinator` with `kind: "report"`. Use it for a finding other tasks need (for example "the API shape changed") or a status note. The task keeps working. The coordinator decides what to do: update the summary, message another task, change or add tasks.
   - **Up to the coordinator, ask (decided 19 November 2026):** `kind: "ask"`. Use it for a question or a blocker the task cannot solve.
     1. The task's turn ends. The task shows **waiting for coordinator**. Its status stays `in_progress` and it keeps its place in the parallel limit of 3, so a waiting task cannot be starved by new starts.
     2. An ask wakes the coordinator at once; it does not wait for the batched wake-up.
     3. The coordinator answers with `send_chat_message`, which starts the task's next turn. Or, when it cannot answer, it passes the question to a person: the task card shows **needs you** with the question, and a person's answer in the coordinator chat or in the task chat starts the task again.
     4. A person can always answer directly in the task chat. The first answer wins; the open ask is then closed, so a late coordinator answer does not start a second turn.
     5. One open ask for each task. A second ask while one is open is refused.
     6. No timeout in v1: an unanswered ask stays visible as waiting. The idle sandbox sleeps under the normal rules.
     7. If the task is stopped or cancelled, its open ask is closed.
     8. Store asks and reports as rows (`projectTaskReports {projectId, taskId, kind, text, state: open \| answered \| closed, answeredBy?}`), not only as chat messages, so the card state is derived from data.
   - **Down from the coordinator:** `send_chat_message` to a child task. If the task is running, the message joins its queue (existing queued-message path). If it is idle or in review, it starts a new turn.
   - **Never:** task-to-task messages, shared file systems, or one sandbox reaching another sandbox's ports. Code moves between tasks only through git (a merged PR, or a named branch a task fetches). Files move only as docs or artifacts.
   - **Loop guard:** a report wakes the coordinator through the batched wake-up (step 3.6). The coordinator's message to a task is a normal turn. Cap automatic coordinator turns for each project in an hour (constant; pick the value with the answer to open question 2) and show a "needs you" state when the cap is hit.
   - **Stale context:** a running task does not see a summary update unless it pulls it or the coordinator messages it. The coordinator prompt must say this.

### Step 7 — Roles, feedback tasks, quiet comments

1. **Roles (decision 12).** No new table and no setting for each project. The project role is derived: `users.role === "dev"` → Contributor; any other value → Viewer. Repo access is still required first.
2. Enforce in one place: `getProjectWithAccess` returns the role; mutations that chat with the coordinator or a child task, approve, run, cancel, retry or edit project settings require Contributor. Child tasks inherit the rule.
3. **Edge cases.**
   - `users.role` is optional. A user with no role set is a Contributor, so nobody who works today is locked out. (My choice; confirm with the user before building.)
   - `users.isAdmin` and team owners are Contributors whatever their role.
   - A designer or business user who must drive a coordinator needs their Eva role changed. No exception for one project in v1.
   - `projects.members`, `projectLead` and `codeReviewer` stay display data. Remove `members` and `codeReviewer` in step 9 if nothing reads them for behaviour.
   - The rule applies to projects only. Sessions and quick tasks keep today's access.
4. **Feedback task.** A viewer can call `createFeedbackTask(projectId, text, attachments)`. It creates a normal task: `todo`, not approved, `origin: "feedback"`. It shows in the coordinator's task table at its next turn. No new entity (422).
5. **Quiet comments.** New table `messageComments {messageId, parentId?, userId, text}` — or generalise `taskComments`/`docComments` into one comments table if their shapes match; check first and prefer one table. Comments do not start a coordinator turn. A comment that mentions the coordinator sends the thread to it as a normal message. Viewers can comment.

### Step 8 — Adopt a session into a project

Risk: this is the least certain step. Move it to v2 if the points below do not hold.

1. Adoption creates an `agentTasks` row with `projectId` and re-owns the session: `sessions.owner` from `standalone` to `{kind:"task", taskId}`.
2. `sessions.owner` is written once today. Check every reader that assumes this (`by_repo_owner_*` indexes, `assertStandaloneSession` callers, `resolvePrOwnerFromBranch`, which parses `eva/session-<id>` branches as a session owner).
3. Refuse adoption when the session is in a group, has linked repos (`sessionRepos`), or has more than one chat. Those cases are v2 (multi-repo projects).
4. The session's existing PR becomes the task's PR. Verify the PR row re-owns cleanly.
5. UI: "Move to project" in the session menu first. Drag and drop only if the sidebar already supports it for sessions.
6. Promote (422): "new project from this session" = create the project, then adopt.

### Step 9 — Convert old projects and narrow the schema

Follow `docs/eva-convex.md` (migration, deploy, run on dev then prod, narrow, delete the migration).

1. For each project: write `generatedSpec` into the summary doc; save `conversationHistory` as a read-only doc named "Planning interview"; map `members` to roles.
2. For each project task with a `sessionChats.taskId` chat in the project session: give it its own task-owned session. Tasks already `done` or `cancelled` keep their history read-only and get no sandbox. A task that is `in_progress` on the old project branch: stop it, keep the branch name on the task so its work is not lost, and let it continue on that branch as its own PR. List these tasks before the prod run and show the user.
3. An open project PR on the old project branch stays as it is, owned by the project until it merges or closes. No new work goes to it.
4. Remove: `projectDetails`, `projects.phase` (after UI reads derived status), `planningMode`, `interview`, `build`, `branchName`, `branchVersion`, project PR summary fields, `sessionChats.taskId`, `ProjectTabs`, `ProjectChatTab`, the Interview and Plan tabs, mobile `ProjectPlan`.
5. Kanban, timeline and list views of projects (`ProjectsClient.tsx`) read the derived status.

### Step 10 — Finish

1. `tsc`; banned-type check; `/parallel-awaits --diff origin/main`; `/changelog`.
2. Move this file to `internal/plans/implemented/`.
3. `/ship`.

## Risks

- **Merge conflicts and stale bases.** Parallel tasks branch from main at different times. Rule 2.4 (a dependency counts only after its PR merges) covers ordered work. Unordered tasks that touch the same files still conflict; the task rebases itself (decision 5). The coordinator prompt must tell it to split work by files and to add a dependency when two tasks touch the same area.
- **Semantic conflicts.** Files merge cleanly but the code breaks. Only CI and review catch this. Not solved here.
- **Half-done features on main.** The coordinator must plan each task so that its merge is safe alone, or put the work behind a flag. This depends on the target repo having a flag method; the coordinator asks the user when it does not.
- **Cost.** Three sandboxes plus coordinator wake-ups. There is no spend cap for each project in v1; the limit of 3 is the only control. State this to users.
- **Review load.** More small PRs for a person to merge. The "needs you" state must be reliable or tasks will wait unseen.
- **APK compatibility.** Steps 1, 2 and 9 remove or reshape functions the phone app calls. Keep wrappers until `scripts/check-apk-compat.sh` passes without them.
- **Sandbox start time.** Each child task pays a cold start. Check snapshot reuse for task-owned sessions before step 2 ships.

## Open questions

All earlier questions are decided (19 November 2026) and are in the decisions table: cross-repo tasks (13), awareness (14), MCP tools (15), wake-ups (16), failures (17), child task chat (18), project end (19), roles (12).

1. **No role set.** Confirm that a user with no Eva role is a Contributor (step 7.3).
2. **Task card look.** Row layout, status wording and the "needs you" marker need a visual choice from the user. Ask at the start of step 4.
