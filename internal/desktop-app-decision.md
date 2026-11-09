# Desktop app for Eva: decision notes

Status: **no desktop app for now, keep web-only.** Written on 2026-11-09 from a chat discussion. Nothing is built.

## Decision

- Keep Eva web-only.
- Cheaper first step: make the web app installable as a PWA, and add Web Push (see `desktop-notifications-web-push.md`). That gives a dock icon, a separate window, and notifications when Eva is closed.
- Build a desktop app only if we want **local runner mode** (agents run on the user's machine). A desktop copy of the web app alone does not justify it.

## Why T3 Code and similar tools stay desktop

This is our reading of how they work, not their stated reasons.

- **The agent runs on the user's laptop.** T3 Code is a GUI over local Codex or Claude Code processes. A browser cannot start processes or read local repos, so these tools need a desktop shell.
- **The user pays for compute.** The user's laptop and their own Claude or ChatGPT subscription do the work. The vendor has no server cost, so the product can be free or cheap.
- **Nothing to set up.** Local tools, env files, secrets, databases and git worktrees already work. Cloud sandboxes must rebuild all of this, and Eva spends a lot of effort on it (snapshots, startup commands, env vars).
- **Trust.** Code does not leave the machine, which many companies require.
- **Speed.** No sandbox cold start.

## Why Eva is different

- Eva is cloud-first. Agents keep running when the laptop sleeps, and teams share one view. Phone access also works. Local-first tools cannot do this easily.
- Eva already has a small local bridge: the `request_local_computer` MCP tool (`packages/backend/convex/mcp/tools.ts`) wakes the user's Grok Bot desktop app through a webhook. It only fires a trigger. The result does not come back to Eva.

## What a desktop app could unlock

1. **Local runner mode (the big one).** Run the same agents on the user's machine at no compute cost to Eva. Cloud sandboxes stay for parallel and background work.
2. **The user's own subscriptions.** Agents could use the user's Claude or Codex login, not tokens that Eva pays for.
3. **Local preview and handoff.** Open a sandbox branch in the local IDE, or test against `localhost` services, with one click.
4. **OS integration.** Native notifications, a menu bar status for running agents, global shortcuts and deep links. A PWA covers most of this.

## If we build it later

- Use an Electron or Tauri shell around `apps/web` plus a local agent daemon. Do not fork the UI.
- For the remote and launch model, see T3 Code's "remote is the same server over a forwarded WebSocket" pattern in `t3code-ideas.md` (section C).
- Costs to plan for: code signing (macOS and Windows), auto-updates, cross-platform builds, and support for local environment problems.

## Related

- `t3code-ideas.md`: T3 Code research and adoption ideas
- `desktop-notifications-web-push.md`: Web Push plan (parked)
- `sandbox-providers-research.md`: cloud sandbox options
