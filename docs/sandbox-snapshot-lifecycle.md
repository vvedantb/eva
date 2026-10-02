# Sandbox & snapshot lifecycle

How Eva owns Vercel Snapshot Storage, what happens when a sandbox dies, and how resume / ops cleanup work. Companion to the never-expire + grace-delete work (2026-08).

## Goal

- **Do not** silently wipe quiet live sandboxes after 30 days.
- **Do not** keep paying Snapshot Storage for dead sessions / tasks forever.
- **We own lifecycle:** never-expire snaps while the entity is alive; delete the sandbox (and purge `snap_*`) when it dies.

## Create / stop policy

Persistent sandboxes use:

- `snapshotExpiration: 0` (never expire)
- `keepLastSnapshots: { count: 1, expiration: 0, deleteEvicted: true }`

Every stop auto-snapshots; keep-last keeps one live snap per sandbox lineage.

Ephemeral sandboxes use a **1-day** safety TTL (Vercel rejects any TTL with `0 < x < 1 day`).

Knobs live in `packages/backend/convex/_sandbox/vercelSnapshotOptions.ts`.

### Who requests a stop

| Trigger | Where | Notes |
|---------|-------|-------|
| Stop button / PR webhook | `requestSessionSandboxStop`, `requestTaskSandboxStop`, `requestProjectSandboxStop` | Divider "Sandbox stopped" |
| Quick-task run end | `_taskWorkflow/workflowDefinition.ts` | Unless a reviewer has the sandbox open or it is a project task |
| Daily auto-stop (opt-in, fixed local time) | `sandboxAutoStop.ts`, 15-min cron | App-wide `appSettings.sandboxAutoStop*` |
| **Idle pause** (opt-in) | `sandboxIdlePause.ts`, 5-min cron | App-wide `appSettings.sandboxIdlePauseMode` (`off` / `dry-run` / `on`) |

Idle pause rule (`_sandbox/idlePolicy.ts`): pause when the agent finished ≥ `sandboxIdleAfterAgentMinutes` (default 5) ago **and** the last human interaction was ≥ `sandboxIdleAfterInteractionMinutes` (default 20) ago, and nothing is busy (open turn, run, build, chat workflow, queued message) or present (a sandbox tab open in the foreground, presence room `sandbox:<entityId>`). Interactions are recorded in the `sandboxActivity` table (`_sandbox/activity.ts`): message sends, turn/run completion, sandbox ready, preview/terminal/editor/file opens, and a once-a-minute traffic heartbeat the in-sandbox preview proxy posts to `/api/preview/activity` while external requests flow. `dry-run` logs `[sandboxIdlePause] would-pause …` to Axiom without acting; `on` stops via the same helpers as the Stop button, with divider "Sandbox paused after N min idle". Pausing changes *when* the one snapshot per sandbox is taken, not how many exist. With the mode `on`, opening a sandbox tab of a paused entity resumes it, and the stable link `/p/<kind>/<id>` wakes it from outside Eva.

## Death → delete (not stop-only)

| Signal | What happens |
|--------|----------------|
| Session archived (manual or PR merge/close) | Schedule sandbox **delete** after **48h** grace |
| Session unarchived / PR reopened | Cancel grace |
| Quick task `done` / `cancelled` | Same 48h grace delete |
| Weekly cron | `sweepDeadSandboxes` backstop |

`vercelProvider.delete()` deletes the sandbox **and** actively purges listed `snap_*` — Vercel cascade alone is unreliable.

Grace: `SANDBOX_DELETE_GRACE_MS` (48h). Helpers / cron: `sandboxCleanup.ts`.

### PR → Archived tab

Merged/closed PRs set `archived: true` (webhook + `setPrState`); reopen / detach clears it. The Archived list filters on that flag.

## Resume when the old sandbox / snap is gone

**Sessions, quick tasks, and projects** all share `tryReuseSandboxHandle` in `_sandbox_runtime/sessions.ts`.

### Flow

1. UI Start / open runs prepare with the stored `sandboxId`.
2. **Try reuse** — wake the existing sandbox from its current snap (up to ~180s, `RESUME_READY_TIMEOUT_SECONDS`).
3. If the sandbox/snap is **missing, deleted, or unresumable** → reuse returns `null` (does **not** hard-fail the start).
4. **Create a fresh sandbox** from the **repo seed / base Image**, not from the deleted session snap.
5. Patch the entity with the **new `sandboxId`** (`sandboxReady` / equivalent) early so the UI can proceed.
6. Re-checkout that entity’s branch, sync refs, startup commands, dev server / preview.

### What you keep vs lose

| Kept | Lost |
|------|------|
| Session/task/project metadata, chat | Old VM filesystem (uncommitted local-only state) |
| Remote git branch (if pushed) | Old processes / terminal state |

### UI copy

- **Sessions:** progress shows **“Previous sandbox expired — creating a fresh one…”** then “Creating sandbox…”.
- **Quick tasks / projects:** same backend fallthrough; progress goes from “Checking existing sandbox…” to “Creating sandbox…” (no separate expired banner).

## Mental model: Vercel dashboard rows

| What you see | Reality |
|--------------|---------|
| `created`, no expiry | Live never-expire resume snap — expected for Eva-owned sandboxes |
| `created`, expires in N days, **not** Eva’s current sandbox | **Orphan** — safe to purge (snaps outlive deleted sandboxes) |
| `created`, expires in N days, **is** current for an Eva sandbox | Needs retention cycle / policy; should not remain after bulk cycle |
| `deleted`, still shows expiry / size | **Tombstone** — already soft-deleted; API `DELETE` returns **400**; UI noise until GC |

Soft-deleted tombstones **cannot** be hard-deleted again via the SDK (official CLI also refuses non-`created`).

## Ops commands (prod)

```bash
cd packages/backend

# Dead entities still holding sandboxes
npx convex run sandboxCleanup:sweepDeadSandboxes --prod

# PATCH live sandboxes to never-expire; cycle start+stop if snaps still expire
npx convex run sandbox:bulkUpdateSnapshotRetention --prod
npx convex run sandbox:bulkUpdateSnapshotRetention --prod '{"cycleIfNeeded":true}'

# Delete orphan created snaps (protect seeds + Eva-referenced currentSnapshotIds only)
npx convex run snapshotActions:purgeUnreferencedVercelSnapshotsAll --prod

# Inspect specific snap ids (optional tryDelete for unprotected created)
npx convex run sandbox:inspectSnapshotsByIds --prod '{"snapshotIds":["snap_…"],"tryDelete":false}'
```

### Purge protection rules

`purgeUnreferencedVercelSnapshots` keeps:

1. All seeded / base Image snap ids (`listAllProtectedSnapshotIds`)
2. `currentSnapshotId` only for sandboxes whose **name is still referenced in Eva** (`listReferencedSandboxIds`)

Ghosts that only appear in Vercel `Sandbox.list` are **not** protected — their snaps are orphans.

Repos missing `VERCEL_PROJECT_ID` are skipped by the all-projects runner.

## What we learned (2026-08 ops)

1. **`sandbox.update` is not retroactive** — existing snaps keep old `expiresAt` until a new snap is minted (start+stop cycle).
2. **Bulk “still-expiring” was a false positive** when it counted soft-deleted list rows; only `status === "created"` matters for retention.
3. **3-day “automatic” snaps** users spotted were often **orphans** (`created`, old TTL, not any live `currentSnapshotId`), not tombstones.
4. **Tombstones** (`status: deleted`) linger in the UI with a fake countdown; Vercel rejects a second `DELETE`.
5. **`Sandbox.list` ghosts** (many listed, few Eva-known) used to keep orphan current snaps protected; Eva-scoped protection fixed that.

## Key files

| Area | Path |
|------|------|
| TTL / keep-last knobs | `_sandbox/vercelSnapshotOptions.ts` |
| Delete + snap purge | `_sandbox/vercelProvider.ts` |
| Grace / sweep / candidates | `sandboxCleanup.ts` |
| Daily auto-stop | `sandboxAutoStop.ts` |
| Idle pause (policy, activity, sweep, wake link) | `_sandbox/idlePolicy.ts`, `_sandbox/activity.ts`, `sandboxIdlePause.ts`, `sandboxWake.ts` |
| Retention bulk + inspect | `_sandbox_runtime/bulkSnapshotRetention.ts` |
| Orphan purge | `snapshotActions.ts` (`purgeUnreferencedVercelSnapshots*`) |
| Resume fallthrough | `_sandbox_runtime/sessions.ts`, `helpers.ts`, `git.ts` |
| PR archive | `githubWebhook.ts`, `_sessions/*` |
