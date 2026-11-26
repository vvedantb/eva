# Schema: drop deletedAt from tasks and projects

- Tasks and projects archive (`archivedAt`), and `dataMigrations:archiveDeletedEntities` copied every `deletedAt` across on prod, so `deletedAt`, its three indexes on those tables and that migration go.
- Sessions, automations and docs still soft-delete: `deletedAt` moves from `entityNumIdFields` to a new `softDeleteFields` that only they spread.
- Deploy only after the migration finished on prod.
