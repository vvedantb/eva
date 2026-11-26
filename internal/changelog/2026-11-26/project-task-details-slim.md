# Project tasks: Details shows prompt, facts, model and activity (no Properties)

- Web: a project task's Details (`TaskDetailsPane`, side panel and full page) is one column: title (full page), prompt, attachments, one muted facts line, a Model section, then Activity. No Overview / Properties switcher.
- The facts line (`projectTaskFacts` in `@eva/shared/projectView`) reads "Working · Phase 2 · docs", then a link per PR with its state icon. The status is the Tasks list display status (Triage, Working, Blocked, Idle, Archived). A multi-repo task names each repo once: a repo with a PR on its link ("api #12"), a repo without one as text. Simple view hides the PRs.
- Removed for project tasks: Status, Priority, Code Reviewer, Labels and Project pickers, and the repo badges (the facts line names repos and PRs). Backend mutations are unchanged.
- Model stays editable with the same lock rules, now one shared helper (`taskModelLockReason` in `@eva/shared/taskDetail`, replaces `canEditTaskModel`). Web extracts `TaskModelRow` from `StatusFieldsSection`.
- Phone: `quick-task/[taskId]` shows the same facts line and a Model row (`ProjectTaskDetails`, the `ModelChip` picker) for a project task. A PR link opens the phone PR screen. The Project summary row is gone. Quick tasks keep their Properties on both apps.
