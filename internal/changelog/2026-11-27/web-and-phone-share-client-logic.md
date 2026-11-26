# Web and phone share client logic

- The project status hooks and the queue edit mutations live once in `@eva/shared` (`projectStatusHooks`, `queuedMessageMutations`). The phone copies are gone. Each app passes its own `useQuery`.
- The sandbox chat empty state and the "waiting for a free slot" line are pure rules in `sandboxComposer.ts`. The phone and the task/project chat panel use them.
- The quick-task board and list share `useQuickTaskBoardActions` (status drag, Run All, failed runs). The projects and quick-tasks lists share one `ActiveFiltersBar` and one `useListSelection`.
- One `ownerLabel` builder names sessions, tasks and projects ("Session #42", "Quick task #12"). Project stages and project task statuses map to a shared `ProjectTone`, which each app colours.
- The review header uses one tone colour map. The Chrome extension reads the task status type from the backend and shows Done pins green, as the web does.
