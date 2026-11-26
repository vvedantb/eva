# Clear dead legacy fields and tables

- New `_migrations/clearLegacyFields` walks ten tables one page at a time and clears every legacy field and table that no code reads or writes. It is safe to rerun. Run it once per deployment, straight after the deploy.
- It keeps old behaviour: a `retry_pending` task run becomes `scheduled` with the same time and job, and the old `sandboxIdleStop*` settings move into the `sandboxIdlePause*` fields when those are unset.
- Code stops reading the dead data: the `retry_pending` branches in `runState.ts`, the idle-stop fallback in `resolveIdleThresholds`, the per-repo usage-limit filter and delete, the queued `orchestratorNotification` copy, and the unused `taskSandboxEvents.listByTask` query.
- The five Manager Ave rebuild migrations in `dataMigrations.ts` fold into the new one. The schema entries stay, marked `@deprecated`, until a follow-up drops them.
