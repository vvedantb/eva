# Notifications: drop three dead types

- `routine_complete`, `run_completed` and `run_failed` leave `notificationTypeValidator`, the routing table, the shared appearance map and the web and phone icon maps. No code created them.
- `dataMigrations:deleteDeadNotifications` (from #1520) deleted their rows on prod and is removed with them.
- Deploy only after that migration has finished on prod; otherwise the schema rejects the old rows.
