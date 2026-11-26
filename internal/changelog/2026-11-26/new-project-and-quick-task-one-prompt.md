# New project and quick task: one prompt, Save / Save and Run

- The New project and New quick task forms (web and phone) have one prompt in place of the title and description, and two buttons: "Save" and "Save and Run" (Enter on web; Shift+Enter is a newline).
- Save creates the project, or files the task in To Do (a project task waits in Triage). Save and Run also sends the project's prompt as the first coordinator chat message, or starts the task (a project task is approved).
- The server titles both from the prompt's first line (`titleFromPrompt`); a generated title (`textGen.generateOwnerTitle`) replaces it while nobody has renamed it.
- API: `projects.create`, `agentTasks.createQuickTask`, `saveDraft` and `activateDraft` lose `title` (and `skipPlanning` / `approved`) and take `run`; agents' MCP task tools keep an optional `title`. Old phone builds break until the next release.
