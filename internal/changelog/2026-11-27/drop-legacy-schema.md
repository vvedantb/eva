# Legacy fields and tables dropped from the schema

- Dropped the fields and tables that `clearLegacyFields` cleared in prod: `taskSandboxEvents`, `sessionDaemonStates`, `retry_pending` task runs, `watchedByOrchestrator`, `sessions.isOrchestrator`, `users.orchestratorSessionId`, `queuedMessages.orchestratorNotification`, `routedMessages.mirroredMessageId`, `appSettings.sandboxIdleStop*` and `agentUsageLimits.repoId`. Deleted the migration and its test.
- Dropped `turns.lane`. The `by_entity_open` index is now `entityId, open`, and turn readers no longer skip lane turns.
- Dropped `sessions.prStateOnArchive` and `sessionRepos.prUrl` / `prState`. Deleted `backfillPullRequests`, its three steps, and the GitHub refresh (`refreshFromGitHub`, `applyGitHubSnapshot`) that only the backfill used.
