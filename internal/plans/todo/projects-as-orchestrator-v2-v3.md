# Projects as orchestrator — v2 and v3 (outline only)

**Date:** 2026-11-19
**Status:** TODO. Outline only, on purpose. Do new research and write a detailed plan when each stage starts.
**Depends on:** `projects-as-orchestrator.md` (v1) must ship first.

This file is separate from the v1 plan because the v1 plan moves to `internal/plans/implemented/` when it is done. These items must stay in `todo`.

## v2

- **Goal with a progress chart.** A project has a stated goal. A chart shows launched, in progress and todo work over time. Reference: the goal and 30-day chart in Amp Spaces (Amp docs, "Spaces", read 19 November 2026).
- **Message routing check ("Jev").** Before a message wakes the coordinator, a check decides whether it is for the coordinator or for a teammate. Start with a plain rule: a message that only @mentions a teammate stays quiet and notifies them; add a model such as Jev (TypeSafe AI) only if the rule mis-routes.
- **Multi-repo, the rest.** v1 lets each child task target any repo the acting user can access. Left for v2: one task that edits several repos in one sandbox; the coordinator reading extra repos in its own sandbox; adopting sessions that are in a group or have linked repos; detecting that a merged change is deployed.

- **Adopt a session into a project** (moved from v1 on 19 November 2026). Includes "promote a session to a new project" from session 422. Known blockers: `sessions.owner` is written once; the branch name and the PR are tied to the session id; sessions in a group or with linked repos.
- **Comments that do not wake the coordinator** (moved from v1 on 19 November 2026). Build it together with the message routing check above.

## v3

- **Schedules that the agent sets itself.** The coordinator sets its own recurring checks from plain language, for example for monitoring after a launch.
- **Separate models for the coordinator and its tasks.** One model setting for the coordinator and one for the child tasks it starts.

## Candidates, not agreed

These came up during v1 planning. The user has not placed them in a version.

- A spend cap for each project, only if usage shows a need (v1 has no task caps, by decision on 24 November 2026).
- Automations as project triggers (Slack, schedule, PR events).

## Before each stage

1. Read what v1 built; the code will differ from the v1 plan.
2. Research again how Cursor Projects, Amp Spaces and Claude handle the item. All three change often.
3. Ask the user the open questions, then write the detailed plan as a new file in `internal/plans/todo/`.
