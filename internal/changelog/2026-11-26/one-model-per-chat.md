# One model per chat

- A chat's model, traits and account live on the chat alone (`sessionChats.lastModel`, `providerAccountId`, `last*`). Projects, tasks and sessions no longer keep their own copies.
- Eva and her tasks: Eva's wakes run on her chat's picks. A project task's chat starts on Eva's (`chatSeedSettings`) and keeps its own picks after that; after a usage limit it takes Eva's again, so a changed account takes over. The project's account is the one Eva's chat runs on, held by the project's owner (`_projects/projectAccount.ts`, was `runSettings.ts`).
- Quick tasks: the New Task form's model, traits and account go on the task's chat when it is created (`seedNewTaskChat`); drafts, batches and automations do the same.
- Sessions: a new session's picks go on its Main chat; a new chat tab inherits from the chat it was opened from, else from Main.
- UI: the Project page (web and phone) and the quick task Properties panel (web) no longer have a model row; the chat composer is the one picker. The phone reads a task's model for @-mentions from its chat (`sessions.getOwnedWithSeed` now returns `model`).
- API: `projects.create`, `projects.update` and `agentTasks.update` drop `model` and `providerAccountId` (and the trait args); create-task paths keep them as the chat's picks.
- Migration `dataMigrations:moveModelToChats` copies stored picks onto a chat that has no model yet, then clears the old fields. The schema drops them in the follow-up PR.
