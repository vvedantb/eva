# Projects: chat tabs and usage chip on one row; task chats stay mounted

- The project's chat tabs (Eva, open task tabs, "+") now sit in the shown chat's header row, left of the usage chip, instead of a row of their own above it. `SandboxChatPanel` takes a `headerLeft` slot; `SandboxChatHeaderActions` lays it out. Quick task and session chats are unchanged.
- Every open task tab's chat stays mounted behind a hidden `<Activity>`, like Eva's: switching tabs no longer remounts the chat or its composer, and a draft survives the switch. Closing a tab unmounts it; the open tabs stay capped at `MAX_PROJECT_TASK_TABS`. A hidden chat runs no effects, so it marks nothing read and takes no keys.
