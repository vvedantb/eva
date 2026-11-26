# Project tasks: Details tab with prompt, status, properties and comments

- Web: a project task has a Details tab (info icon), first on its rail in the project panel (Details, Chat, Preview, Browser, Review) and on its full page. It shows the quick task's overview: title, prompt, attachments, activity and comments, and the status and properties column (Overview / Properties switcher on a phone). An archived task stays read-only.
- `TaskDetailsPane` holds that overview, extracted from `TaskDetailInline`; the quick task page, the panel (`ProjectTaskPane`) and the full page use it, with data from `useTaskDetail` (no new queries).
- Default tab: a task that has never run (no `lastRunStartedAt` on its row) opens on Details; a task that has run opens on Chat, as before (`defaultProjectTaskTab`). A tab in the URL (`/sandbox/task-chat`, `?file=`, `?diffFile=`) still wins.
- Full page before the task has a sandbox: a small rail with Details and Preview (`TaskDetailsRailFrame`); Preview keeps the "no sandbox yet" state.
- Simple view keeps the Details tab (`task-details` is in its allowed sandbox tabs).
- Phone app: no change; its task screen already shows these.
