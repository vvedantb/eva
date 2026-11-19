# Projects as orchestrator — v2 and v3 (outline only)

**Date:** 2026-11-19
**Status:** TODO. Outline only, on purpose. Do new research and write a detailed plan when each stage starts.
**Depends on:** `projects-as-orchestrator.md` (v1) must ship first.

This file is separate from the v1 plan because the v1 plan moves to `internal/plans/implemented/` when it is done. These items must stay in `todo`.

## v2

- **Goal with a progress chart.** A project has a stated goal. A chart shows launched, in progress and todo work over time. Reference: the goal and 30-day chart in Amp Spaces (Amp docs, "Spaces", read 19 November 2026).
- **Message routing check ("Jev").** Before a message wakes the coordinator, a check decides whether it is for the coordinator or for a teammate. v1 has only quiet comments plus an explicit mention.
- **Multi-repo projects.** A project can hold work in more than one repo. v1 projects are single-repo, and v1 refuses to adopt sessions that are in a group or have linked repos.

## v3

- **Queued task starts.** Extra task starts wait in a queue. v1 uses a fixed limit of 3 parallel tasks for each project.
- **Schedules that the agent sets itself.** The coordinator sets its own recurring checks from plain language, for example for monitoring after a launch.
- **Separate models for the coordinator and its tasks.** One model setting for the coordinator and one for the child tasks it starts.

## Candidates, not agreed

These came up during v1 planning. The user has not placed them in a version.

- A setting for the parallel limit for each project, and a spend cap for each project.
- Automations as project triggers (Slack, schedule, PR events).

## Before each stage

1. Read what v1 built; the code will differ from the v1 plan.
2. Research again how Cursor Projects, Amp Spaces and Claude handle the item. All three change often.
3. Ask the user the open questions, then write the detailed plan as a new file in `internal/plans/todo/`.
