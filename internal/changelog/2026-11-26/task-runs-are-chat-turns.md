# Task runs are real turns in the task's chat

- Every task run (quick and project tasks: first run, re-run, retry, Resolve Conflicts, Make changes) now writes a user row and an assistant reply into its task's Main chat, tagged `runId` (`_taskWorkflow/runChatTurn.ts`). Before, runs wrote no `messages` rows and the web faked one opening turn, so failed runs, re-runs and project-task runs showed nowhere, and the phone showed no runs.
- The run streams on its chat's stream id, and `turns.getChatStatus` reports the open run as the chat's turn, so web and phone show Working, the live bubble and Stop with no special case. The `task-run-<runId>` stream id is gone.
- One helper, `settleRunChatTurn`, fills the reply on every terminal path (completion, Stop, stale cleanup, watchdog, failed start): the agent's last text, then `Error: …` on failure; Stopped on cancel. A failed run now keeps the agent's final text (`buildRunResultSummary`), so a question it stopped on is not lost.
- A finished run marks the chat and task unread (`closeTurn` stamps the chat a run streamed into).
- Web: deleted the fake first-run turn (`firstRunChatTurn.ts`, `firstRun` on the chat binding, `isFirstRunInProgress`). Server: deleted `agentRuns.getActivityLog` and `agentRuns.getMedia`.
- Backfill: run `internal._migrations.backfillRunChatTurns.backfillRunChatTurns` once in dev and prod. It writes the old first-run turn only into chats with no later rows (system alerts aside), since rows sort by insert time.
