# Fix drifted copies after the task-run move

- A routed reply now wakes Eva through `queueSystemChatMessage`, on the chat's sticky model, traits and provider account, like every other send. It no longer writes `queuedMessages` by hand with only a model.
- The phone's Stop button uses the web's `isChatTurnExecuting`, now in `@eva/shared`: a finished reply ends a stale open turn, so Stop no longer sticks.
- PR recap and automation completions check repo access, as doc interview already did.
- Launch code handles only the entity fields a backend path still sends (`chatId`, `docId`, `reportId`, `automationRunId`). The `sessionId`, `taskId` and `projectId` branches, the legacy session daemon paths, the `interview` turn lane plumbing and the `project` stream owner are gone. The `lane` schema field stays, since old turn rows may hold it.
- Removed the unused `upsertStreamingActivity` copy and `scheduleTaskOrchestratorNotify`, and fixed comments that said task runs skip checkpoints and turn-end commits: only automation runs (`RUN_ID`) do.
