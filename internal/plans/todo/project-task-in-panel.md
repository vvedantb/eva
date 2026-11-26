# Project task in the side panel

**Date:** 26 November 2026
**Status:** TODO, one PR (web only).
**Mock:** agreed with the user in chat on 26 November 2026 (rail with the task section on top, divider, coordinator tabs below; Tasks tab marks the open task).

## Decisions (user, 26 November 2026)

| # | Decision |
|---|---|
| 1 | Clicking a task in a project keeps the coordinator chat on the left and shows the task in the right panel, on its Chat tab. |
| 2 | The tab rail gets a task section on top: a `#904` chip (title on hover), then the task's tabs, then a divider, then the coordinator's tabs as today. The section exists only while a task is open (as Replies). |
| 3 | Task tabs show only when they have content: Chat always; Preview and Browser while the task's sandbox runs; Review once the task has a PR. Order: Chat, Preview, Browser, Review. |
| 4 | The panel header for a task tab: `#904` and the title, Expand (opens today's full task page), ✕ (closes the task; the panel returns to Tasks). |
| 5 | The Tasks tab marks the open task's row (tint and left accent, "open" in its second line). |
| 6 | Phone: no change (it already opens a task as its own screen). |

## Design

- **State in the URL.** The open task is a search param on the project page, `?task=<taskNumId>`, as `?thread=` for Replies. The panel tab ids gain `task-chat`, `task-preview`, `task-browser`, `task-review` (`projectSandboxTabs.ts`), so they never clash with the coordinator's tabs. Closing the task clears `?task=` and lands on `tasks`.
- **Full page stays.** `/projects/$numId/$taskNumId` keeps rendering today's full task page. Expand navigates there. Links from outside the project (Inbox, notifications, search) keep opening the full page; links inside the project page (Tasks tab rows, task links in the coordinator chat) open the panel.
- **Rail.** `SandboxTabBar` already takes `leadingTabs`; add a leading group with its own header chip and a divider after it, rather than a second tab bar.
- **Panes.** Reuse the task's own components: `TaskSandboxChatPanel` for Chat; the task sandbox's preview/browser/review panes for the others (owner `{ kind: "task" }`, `useSandboxPanes` / `SandboxPaneSlots` as `TaskSandboxPanel` uses them). Mount the task panes keep-alive only while the task section is open (`KeepAlivePane` / `<Activity>` per CLAUDE.md; a terminal or WebGL pane uses `hidden`).
- **Visibility facts.** Sandbox running and "has a PR" come from the task row the Tasks tab already loads (`listByProject`), so the rail needs no new query.

## Out of scope

- Splitting chat and preview side by side inside the panel (Expand covers it).
- Phone.

## Checks

- tsc (web), lint, web tests, `design-check` and `compiler-check` scripts.
- Browser: open a task from the Tasks tab, switch its tabs, Expand, ✕, switch to another task, reload with `?task=` set, an archived task (read-only, as on its full page).

## Changes while building

- Task links in the coordinator chat point at `/quick-tasks/<numId>` (markdown links and `@` chips), not at the project task page, so they keep their behaviour.
- A project whose coordinator session does not exist yet has no rail: its Tasks rows still open the full page.
- The panel has no Files, Agents or terminal: chat actions that open them (and diffs while the task has no PR) expand to the full page with `?file=` / `?diffFile=`.
- Review uses the task row's own `prUrl`. The full page passes the project's PR for a project task (`taskPrUrl`); it is unchanged.
- "Sandbox runs" is the row's `sandboxStatus === "active"`. When the sandbox stops on Preview or Browser, the panel falls back to the task's Chat.
- The full page finds a task only in the non-archived list, so it shows "not found" for an archived task; the panel also reads the archived list. The full page is left unchanged.
