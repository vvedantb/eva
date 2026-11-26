# Archived tasks: no new comments; phone names an archived project

- The server refuses to add, edit or delete a comment on an archived task or a task of an archived project (`taskComments.create`/`update`/`remove` call `assertTaskNotArchived`), as for every other edit.
- Web: an archived task's Activity keeps its comments but hides the comment box, the reply boxes and Edit/Delete (`ActivityTimeline` / `CommentThread` / `CommentActivityItem` `readOnly`).
- Phone: the comment hold menu keeps reactions and Copy only; the task's Project row names its project when that project is archived (from `projects.get`, not the live list).
