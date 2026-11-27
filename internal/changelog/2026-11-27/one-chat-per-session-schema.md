# One chat per session: schema clean-up

- After `deleteExtraSessionChats` has run, every `sessionChats` row is a session's one chat. Removed the fields that only told chats apart: `title`, `number`, `isMain`, `archived`, and the `by_session_and_number` index; `findMainChat` reads `by_session`.
- Removed `pullRequests.watch.sessionChatId`, the migration and its test.
