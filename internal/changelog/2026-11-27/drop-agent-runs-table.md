# The agentRuns table is gone

- Dropped the empty `agentRuns` table and its id from `turnEntityIdValidator`, now that `deleteRunTurns` removed the old run turns that named it. Deleted that migration. Every task run is a task-mode chat turn (`_agentTasks/taskRunTurn.ts`).
