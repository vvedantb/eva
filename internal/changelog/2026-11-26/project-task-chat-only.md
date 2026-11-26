# Project tasks are their chat: no Details tab; prompt card before the first run

- Web panel: a task tab has no Details tab. Its rail shows only tabs with content: Review (it has a PR), Preview and Browser (its sandbox runs). It opens on Review, else Preview (`defaultProjectTaskTab`). A task with none shows the coordinator's Tasks tab. An old `sandbox/task-details` link lands there too.
- Web full task page: no Details tab or Details rail (`TaskDetailsRailFrame` deleted). The panel opens on Review when the task has a PR, else Preview.
- Header line: the panel header and the full task page header show the status and PR line (`projectTaskFacts`) under the title. The phone chat header shows it under the title (`ChatHeader` `subtitle`).
- Prompt card: a project task in To Do with an empty chat shows its title, prompt and attachments (editable under the same rules as before) and Approve (Triage, `approveProjectTasks`) or Start (approved, `agentTasks.startExecution`). Web `ProjectTaskPromptCard` through `ChatBody` `emptyState`; phone `ProjectTaskPromptCard`. Shared rules: `showsProjectTaskPrompt`, `projectTaskPromptAction`.
- Comments, activity and the Model row are gone for project tasks on web and phone. The composer's model picker stays. Comment rows and backend mutations are unchanged.
- A project task opened on the quick task page goes to its project task page (web `ProjectTaskPageRedirect`); on the phone it opens its chat. Phone project task rows open the chat.
- Removed: `ProjectTaskDetails` (phone), `TASK_DETAILS_TAB`, `projectTaskOpensOnDetails`, the project branches of `TaskDetailsPane`, `ActivityTimeline` and phone `TaskActivity`. Phone `TaskTitle` and `TaskDescription` moved to `quickTasks/TaskText.tsx`.
- Fix: a task or project chat that does not exist yet shows its empty state, not a loading state (web and phone).
