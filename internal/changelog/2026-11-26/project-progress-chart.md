# Projects: a 30-day progress chart

- The Project page (web and phone) shows the last 30 days under the project context: tasks shipped (PR merged or marked Done) and tasks archived without shipping as stacked bars per day, and the tasks open at each day's end as a line. Hover shows a day's numbers; click or tap a day to list its tasks, and a task opens its chat.
- Tasks record when they shipped and closed (`agentTasks.shippedAt`, `closedAt`), stamped where status, PR state and archive change (`reconcileTaskCloseTimes`); a reopened task clears them.
- `dataMigrations:backfillTaskCloseTimes` stamps project tasks closed before this, from their activity log, merged PRs and archive time.
- Plan: the project goal, agent-set schedules and Tasks filters moved to v4.
