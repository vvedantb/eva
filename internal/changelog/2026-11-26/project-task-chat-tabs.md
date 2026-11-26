# Projects: task chats as tabs next to Eva

- A tab bar sits above the project's chat column: Eva (the coordinator, never closed), then the open task tabs, then `+` (New task). It reuses the session chat tab pill and running mark (`ChatTab`, `ChatTabStrip`, `ChatTabAddButton` in `ChatTabsBar.tsx`); the session bar looks and works as before.
- Clicking a row in the Tasks tab opens the task as a tab (or selects it). The chat column shows that task's own chat (`ProjectTaskChat`); the panel shows only that task's tabs (Details, Preview, Browser, Review, each only with content), on Details. Eva's tab returns to the coordinator's chat and to the panel tab it left.
- The URL holds the tabs: `?tasks=903,907` (open, in order) and `?task=903` (selected; absent = Eva). A lone `?task=` still opens that one tab. Up to 5 task tabs; a 6th closes the oldest (`projectTaskTabList`).
- ✕ closes a task tab; closing the selected tab selects the tab to its left. A task tab shows the running mark while the Tasks list counts the task as Working; Eva's tab shows it while the coordinator's turn runs.
- Why: the task's chat was squeezed into the side panel. The chat column now holds whichever chat is in focus, and Eva's chat stays alive (`<Activity>`) so switching back is instant.
- Removed: the panel's task Chat tab (`task-chat`), the task panel header's ✕, the rail's task chip and divider (`SandboxTabBar` `leadingGroup`). The Tasks tab and the chat tabs share one New task modal (`ProjectNewTaskModal`).
