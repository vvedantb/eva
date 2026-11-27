# One chat per session

- A session has one chat (its Main chat). The chat tabs, "+ new chat", rename and close are gone on web and phone, and so is the `?chat=N` link param.
- Backend: removed `sessionChats.create`, `rename`, `remove`, `listForSession`, `purgeDeletedChat`, `turns.listSessionChatStatuses`, the per-session cap on running chats (`MAX_PARALLEL_CHATS`, "Waiting for a free slot"), the "other chats may edit this checkout" prompt note, and closed-chat checks. `resolveForSession` and `resolveDeliveryChat` take only the session.
- MCP: `send_chat_message` has no `chat` argument; a PR watch no longer names a session chat.
- Migration `dataMigrations:deleteExtraSessionChats` deletes every non-Main chat (26 in prod, 25 already empty tombstones) with its messages, thread follows, queue, cards, closed turns, preview calls, drafts, read markers and recaps; docs and artifacts made in it move their anchor to Main. A chat with an open turn is skipped and logged. It also clears `pullRequests.watch.sessionChatId`.
- Old phone builds: their chat tabs call removed functions (`listForSession`, `create`, `rename`, `remove`, `listSessionChatStatuses`) until the next phone release.
