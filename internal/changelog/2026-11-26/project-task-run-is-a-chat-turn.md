# Project tasks: Run is a chat turn too (phase 2a)

- Every task run, quick or project, now starts through `startTaskRunTurn` (`_agentTasks/taskRunTurn.ts`): Run, Retry, Resolve Conflicts, a schedule, an auto-start, the project scheduler (`startProjectTask`), the coordinator's `retry_task` and an answer to a task's question. Nothing starts an `agentRuns` row any more; the run code stays until phase 2b deletes it.
- A project task's Run copies the project's model and account onto the task and its chat when it takes them (`takesProjectSettings`: first run, or after a usage limit). The project block is not added to the task prompt: every turn of the task's chat already carries it.
- An answer to a task's question is the Run's own chat message (`resumeWithAnswer`): the chat shows the answer once, and the agent gets the task prompt plus the answer note. A busy chat queues the Run instead of refusing the answer.
- A task-mode turn's end (`onTaskRunTurnClosed`) covers project tasks: a turn that filed a question leaves the task In Progress (waiting); a stop closes its open questions; the project scheduler runs again, and again at a usage limit's reset.
- The scheduler's facts read the last run through `lastTaskRunOutcome`: the newest task-mode turn, or the newest old run for a task that has none yet, so an old failed run still halts its task. The failed-run badge and `getRunFacts` read the same way for both task kinds.
- Analytics (first-try rate, agent time, runs per day, heatmap) count task-mode turns; history before runs became turns drops out.
- Deleted `tests/runChatTurn.test.ts` (old run path); the scheduler and coordinator tests now drive real task-mode turns.
