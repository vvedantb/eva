# Projects as orchestrator — v2 and v3 (outline only)

**Date:** 2026-11-19
**Status:** v2 built (all merged by 26 November 2026). v3 TODO, outline only, on purpose. Do new research and write a detailed plan when each v3 item starts.
**Depends on:** `projects-as-orchestrator.md` (v1) must ship first.

This file is separate from the v1 plan because the v1 plan moves to `internal/plans/implemented/` when it is done. These items must stay in `todo`.

## v1 follow-ups (separate PRs, before v2)

- **PR 2: Inbox (built 25 November 2026).** The Inbox has "Needs you" (default: Questions, To review, Failed; Triage was removed in #1551, from `needsYou.list` and `@eva/shared/needsYou`) and "Updates" (the notification feed), on web and phone. Not done: a repo picker inside the global Inbox; a Needs you count on the nav badge.
- **PR 3: Legacy cleanup.** Delete the old project interview and plan tabs and their code, after `migrations:convertProjects` has run on production.

## v2 (built)

Scope (decided 25 November 2026): how people and Eva talk in the coordinator chat, plus Triage routing. The larger items moved to v3.

- **Message routing check ("Jev").** Before a message wakes the coordinator, a check decides whether it is for the coordinator or for a teammate. Start with a plain rule: a message that only @mentions a teammate stays quiet and notifies them; add a model such as Jev (TypeSafe AI) only if the rule mis-routes.
- **Comments that do not wake the coordinator** (moved from v1 on 19 November 2026). Build it together with the message routing check above.
- **Reply threads on messages** (added 25 November 2026). Any message in the coordinator chat can get replies, Slack style: "3 replies" with the repliers' avatars under the message, and a side panel ("Comments") with the message on top, its replies and a composer. Replies are between people and do not wake the coordinator unless they @mention Eva. Separate from task threads. Build with the routing check and quiet comments above.
- **Coordinator talks like a chat bot** (added 25 November 2026). Replies are a few short lines, as the Grok bot. While it works, the chat shows a typing indicator ("Eva is typing", three dots, as iMessage and WhatsApp) instead of reasoning and tool steps; the steps stay one tap away on the finished message for debugging.
- **Triage removed** (added 25 November 2026; changed 26 November 2026, #1551). Work goes in through Eva's chat, as in Amp: she starts it or adds it to an open task. No Approve step; existing Triage items were handed to her once (`dataMigrations:handTriageToEva`). Her replies show a card for each task she created or gave work to.

## v3

- **Schedules that the agent sets itself.** The coordinator sets its own recurring checks from plain language, for example for monitoring after a launch.
- **Separate models for the coordinator and its tasks.** One model setting for the coordinator and one for the child tasks it starts.
- **Filters and labels on the Tasks list** (added 25 November 2026). Filter chips above the list: Added by, Repo, Phase (data that exists today) and Label. The coordinator tags each task with labels (copy, ui, checkout...) when it creates or groups it; people can add labels too. Idea from Vercel Board threads. Outside agents (Board's CLI claims) are out: projects stay Eva only.
- **Adopt a session into a project** (moved from v1 on 19 November 2026; moved to v3 on 25 November 2026). Includes "promote a session to a new project" from session 422. Also (added 25 November 2026): select several quick tasks or sessions and group them into a new project. Each one becomes a thread (a child task) with its chat, branch and PR kept; the new coordinator chat starts empty and reads the threads from its task table. Quick tasks are the easy case (a task already owns its session); sessions carry the blockers below. Known blockers: `sessions.owner` is written once; the branch name and the PR are tied to the session id; sessions in a group or with linked repos.
- **Goal with a progress chart.** A project has a stated goal. A chart shows launched, in progress and todo work over time. Reference: the goal and 30-day chart in Amp Spaces (Amp docs, "Spaces", read 19 November 2026). (moved from v2 on 25 November 2026)
- **Multi-repo, the rest.** v1 lets each child task target any repo the acting user can access. Left for v3: one task that edits several repos in one sandbox; the coordinator reading extra repos in its own sandbox; adopting sessions that are in a group or have linked repos; detecting that a merged change is deployed. (moved from v2 on 25 November 2026)

## Candidates, not agreed

These came up during v1 planning. The user has not placed them in a version.

- A spend cap for each project, only if usage shows a need (v1 has no task caps, by decision on 24 November 2026).
- Automations as project triggers (Slack, schedule, PR events).

## Before each stage

1. Read what v1 built; the code will differ from the v1 plan.
2. Research again how Cursor Projects, Amp Spaces and Claude handle the item. All three change often.
3. Ask the user the open questions, then write the detailed plan as a new file in `internal/plans/todo/`.
