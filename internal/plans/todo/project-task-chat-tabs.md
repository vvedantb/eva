# Project task chats as tabs

**Date:** 26 November 2026
**Status:** TODO, one PR (web only).
**Supersedes:** how `project-task-in-panel.md` (#1513) opens a task. The panel's task Chat tab goes; the task's chat moves to the chat column.
**Mock:** agreed with the user in chat on 26 November 2026 (four steps: Eva tab → open #903 as a tab → open #907 too → back to Eva).

## Decisions (user, 26 November 2026)

| # | Decision |
|---|---|
| 1 | Above the project's chat column, a tab bar like a session's chat tabs (`ChatTabsBar`). The first tab is always **Eva** (the coordinator) and cannot be closed. |
| 2 | Clicking a task (Tasks tab rows) opens it as a tab next to Eva, or switches to it if open. The chat column shows that task's own chat. |
| 3 | The right panel follows the selected tab. Eva's tab: the coordinator's tabs as today (Tasks, Artifacts, Documents, Agents, Replies). A task's tab: that task's tabs only (Details, Preview, Browser, Review — each only when it has content, as today). |
| 4 | Several tasks can be open at once. A task that is working shows the session tabs' loading mark on its tab. ✕ closes a task tab; closing the selected one selects the tab to its left. |
| 5 | Up to 5 task tabs; opening a 6th closes the oldest. |
| 6 | `+` at the end of the bar opens New task (the project's existing create flow). |
| 7 | The Tasks tab marks rows that are open as tabs. |
| 8 | Expand (open the full task page) stays, in the task's panel header. The panel header's ✕ goes (the tab has ✕). |
| 9 | Phone: no change. |

## Design

- **URL:** `?tasks=903,907` (open task tabs, in order) and `?task=903` (selected task tab; absent = Eva). Replaces today's single `?task=`; `?task=` alone still works (it opens that one tab). Panel tab ids stay `task-details`, `task-preview`, `task-browser`, `task-review`; `task-chat` is removed.
- **Default right tab** for a task tab: Details (the chat is on the left now). An explicit tab in the URL wins.
- **Reuse:** the tab pill look and running mark from the sessions `ChatTabsBar` (extract a shared presentational piece if needed, without changing the session bar); `TaskSandboxChatPanel` for the task chat; `TaskDetailsPane` and the task panes from `ProjectTaskPane` for the right side.
- **Keep-alive:** the selected task's chat is mounted; others unmount (bounded cost). The Eva chat stays keep-alive (`<Activity>`), so switching back is instant.
- **Archived:** an archived task's tab is read-only, as on its full page.

## Out of scope

- Side-by-side chats.
- Phone.

## Checks

- tsc (web), lint, web tests, design-check and compiler-check.
- Browser: open #903 from Tasks (tab appears, chat column shows its chat, panel shows its Details); open #907 (third tab); back to Eva (coordinator chat and tabs); ✕ on a tab; reload keeps tabs; open a 6th task closes the oldest; Expand; an archived task tab.

## Changes while building

- Eva's tab also shows the running mark, while the coordinator's turn runs (the session bar shows it on Main too).
- Selecting a task tab always opens its Details; Eva's tab returns to the coordinator tab it left (kept in memory; after a reload it is Tasks).
- A project whose coordinator session does not exist yet has no chat tabs, as it had no rail: its Tasks rows still open the full page.
- The chat column and the panel each read the task with `useTaskDetail` (Convex shares the subscriptions). A Start pressed in one shows "Starting" in the other once the sandbox status changes.
- `?tasks=` with one tab is written as a number: the router quotes a lone numeric string.
- The task panel header keeps its number, title and Expand; only ✕ goes.
