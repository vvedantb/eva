# Projects: no Triage, work goes in through Eva's chat

- Every project task a person, an agent outside the coordinator or a move into a project adds is approved and handed to the coordinator (Eva) at once, with one wake (`handTasksToCoordinator`, `_projects/scheduler.ts`). She adds it to an open task (`merge_task_into`) or starts it (`start_task`). Nothing waits for an Approve click; "Save and Run" still starts a task now.
- `buildWorkflow.approveProjectTasks` is gone, with the `approve` Needs you reason, the `triage` display status and the Inbox Triage group. The wake reason stays `triage` (a schema literal).
- `dataMigrations:handTriageToEva` hands the old Triage tasks over: one wake per project, keyed by the project, so a re-run wakes no one.
- Tasks list groups are Needs you (was Blocked), Working, Idle, Archived, with no Approve / Reject / "Approve all". A handed task sits in Idle as "With Eva". The rail's Tasks badge counts Needs you.
- The prompt card shows Start, or a quiet "With Eva" while she places the task; no Approve.
- The "+" in the project chat tabs and the Tasks panel opens Eva's tab and focuses her composer (`requestComposerFocus`); `ProjectNewTaskModal` and the quick task modal's `projectId` prop are gone. Phone: "+" opens Eva's chat (the native composer cannot take focus from outside yet).
- The coordinator prompt says people's asks arrive in its chat or handed to it, and to group related ones into one task.
