# Notifications: drop the old email opt-in field

- `users.emailNotificationsEnabled` leaves the schema; `users.notificationPrefs` (email Instant / Daily digest / Off, push, Product updates) replaced it in #1546.
- `dataMigrations:migrateNotificationPrefs` cleared the field on prod and is removed with it, along with its mapping helper and test.
- Deploy only after that migration has finished on prod.
