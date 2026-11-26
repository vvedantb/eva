# Quick tasks: Run is a chat turn, not an agentRuns row

- A quick task's Run (and Retry, Resolve Conflicts, a schedule firing, an auto-start from an automation or evaluation) now queues a task-mode message in the task's chat (`_agentTasks/taskRunTurn.ts`, `startQuickTaskRun`). The normal session chat workflow runs it on the chat's daemon, so a Run shares the chat's transcript, tools and push/PR path. Quick tasks no longer write `agentRuns` or start `taskExecutionWorkflow`; project tasks still do (phase 2).
- The marker `taskRun: { mode }` rides the queued message, the turn and the user row. The chat shows the task text; the agent gets the implementation (or conflict) prompt from `buildTaskRunPrompt`, shared with project runs.
- Status: a task-mode turn opening sets In Progress; its close sets Review on success and To Do on error, Stop or stall, unless a person picked a status meanwhile (`_agentTasks/taskRunStatus.ts`, called from `openSessionChatTurn` and `closeTurn`). Plain chat messages never move the card. Stall and usage-limit retries keep the marker.
- Dropped for quick tasks, by decision: the run-only retries (chat rules apply) and the no-change check.
- One read for both task kinds: `agentTasks.getRunFacts` (has runs, running, PR error, deployment) replaces `agentRuns.listByTask` on web and phone. The failed-run badge and the inbox read a quick task's last task-mode turn. Deleted `agentRuns.get`, `getWithDetails`, `listByTask`, `getLatestDeploymentStatuses` and `getLatestDeploymentByProject`.
- The sandbox gate allows a task that is In Progress, so the queue can wake a never-run task's first Run. A turn that cold-creates its sandbox now clones linked repos.
- Old phone builds that call `agentRuns.listByTask` break on deploy; ship with the phone release.
