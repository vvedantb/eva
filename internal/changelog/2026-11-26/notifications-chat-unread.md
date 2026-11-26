# Notifications v2.5 (B): chats go unread for teammates' messages

- A person's post in a chat's main transcript now lights the chat's unread dot for its other readers, as an Eva turn did. Quiet comments in a coordinator chat count. Thread replies do not; they keep their own unread (part A).
- New field `lastPersonMessageAt` on `sessionChats`, `sessions`, `agentTasks` and `projects`. The unread clock is the later of it and `lastTurnFinishedAt` (`chatReads.lastChatActivityAt`). `lastTurnFinishedAt` keeps its other readers (coordinator idle, asks).
- One helper, `chatReads.stampChatActivity`, stamps the chat, its session and its task or project. `closeTurn` and `recordPersonChatPost` both use it.
- `recordPersonChatPost` runs in `startExecute`, `sendSessionChatMessage` (phone, queue, task and project chats) and a new session's first message. It marks the post read for the author and gives each person it mentions a read row from just before it, so they become readers of that chat.
- No new notification: a post with no mention lights the dot and the NEW line only (decision 1). The NEW line already showed teammates' messages.
- No migration. Existing chats keep their state; the new field starts with the next post.
