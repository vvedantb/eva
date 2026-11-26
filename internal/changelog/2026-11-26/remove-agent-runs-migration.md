# Migration: empty agentRuns before the run system goes (phase 2b, step 1)

- `internal._migrations.removeAgentRuns.removeAgentRuns` pages through every task. For a task with no task-mode turn, its latest settled run first becomes a closed task-mode turn in its chat, so a failed or stopped project task stays held and keeps its failed badge. A quick task whose chat moved on after that run gets none (rows sort by insert time). Then it deletes the task's `agentRuns` and `agentRunActivityLogs` rows and clears `messages.runId`, `pullRequests` owner `runId` and any `running` `task.run`. A last pass deletes rows of deleted tasks. Safe to re-run.
- Run it in dev, then prod. Step 2 deletes the run code, the tables and the fields, and this migration.
