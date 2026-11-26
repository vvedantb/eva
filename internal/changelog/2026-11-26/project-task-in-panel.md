# Projects: open a task in the side panel

- A click on a task in a project's Tasks tab keeps the coordinator chat and opens the task in the right panel (`?task=<numId>`, tab ids `task-chat` / `task-preview` / `task-browser` / `task-review` in `projectSandboxTabs.ts`), as `?thread=` opens Replies. Before, the task replaced the coordinator.
- The rail gets a task group on top (`SandboxTabBar` `leadingGroup`): a `#904` chip (title on hover), then Chat always, Preview and Browser while the task's sandbox runs, Review once the task has a PR, then a divider and the coordinator's tabs. The facts come from the `listByProject` row the Tasks tab already loads, so no new query.
- The task panes reuse the task's own parts (`ProjectTaskPane`: `TaskSandboxChatPanel`, `useTaskDetail` in `project-task` mode, `useSandboxPanes` and `SandboxPaneSlots` on the task's session, own `SandboxSurfaceProviders`), so comments, snapshots and annotations go to the task's chat. An archived task is read-only, as on its full page.
- The panel header shows `#904` and the title, Expand (the unchanged full page `/projects/$numId/$taskNumId`) and ✕ (clears `?task=`, back to Tasks). Chat actions for Files, Agents or diffs without a PR expand to the full page.
- The Tasks tab marks the open task's row (tint, accent stripe, "Open" in its second line via `projectTaskSummaryLine` `open`).
