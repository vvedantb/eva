# Mode: implicit state machines

An implicit state machine is a lifecycle whose states and transitions are not written down in one place. The states live in a mix of flags, optional fields and status strings. The transitions are writes scattered across files. Nothing says which combinations are legal, so illegal ones happen: a cancelled run marked successful, a stop undone by a slow start, a spinner that never ends.

## Search split

- **Server / data layer**: schema first. List every table with a `status`, `state`, `phase` or `kind` field, or lifecycle timestamps (`startedAt`, `finishedAt`, `cancelledAt`, `archivedAt`). Then find every write to those fields.
- **Client / UI layer**: components and hooks with several `useState` / `useRef` values that change together, and hooks that drive async flows.
- In a large backend, split the server by domain (sandbox and sessions; tasks, projects and automations).

## Signals

### Server

| Signal | What to look for |
|---|---|
| Scattered transitions | The same status field written from many files (`patch(id, { status: ... })`) with no shared transition function or allowed-transition check |
| No guard on the write | A writer that sets a status without reading the current one first. Ask: can this run after a terminal state? After a newer attempt started? |
| Status vs. fields | A status AND timestamps or ids that can disagree (`running` with `finishedAt` set; `closed` with a live VM id) |
| Lifecycle by optional fields | No status at all; the phase is "which fields are set" |
| "Id present means busy" | `activeWorkflowId` / `jobId` used as a lock with no check before overwrite. Doubly risky when several job kinds share one slot |
| Stale async writes | A slow action's success or failure callback with no token or attempt id, so an old attempt can overwrite a new one |
| No exit | A state with no timeout, watchdog or user action that leaves it (`starting` forever, `delivering` forever) |
| Terminal not final | `cancelled` / `success` / `error` can be overwritten by a late writer |
| Ownership confusion | Two actors (a workflow and a user) both write the same field; the late one wins regardless of intent |
| Re-derived checks | The same `status === "a" \|\| status === "b"` written in many files; a helper exists but few use it |
| Dead states | A union member that is never written, or written but never read |
| Public setters | Public endpoints that set any status with no lifecycle guard (and often no callers) |

### Client

| Signal | What to look for |
|---|---|
| Boolean clusters | `isLoading` + `isError` + `isOpen` + `isSubmitting` that encode one mode; several confirm-dialog booleans that can all be open |
| Effect chains | An effect that reacts to flag A to set flag B, or that starts a mutation when data has a certain shape. Check its dependency list: does it re-fire on new callback identities? |
| Loading that sticks | `setLoading(true)` before an await with no catch path that resets it |
| Missing in-flight guard | A button whose handler can run twice (skip-confirm shortcuts, double clicks) because `disabled` ignores the in-flight flag |
| Async after cancel | Stop / close / unmount does not invalidate a pending start, so it completes and undoes the stop. Look for a generation counter; if there is none, this is the bug |
| Untracked timers | `setTimeout` for retry or polling not stored or not cleared on cleanup |
| Component-wide flags for per-resource facts | One `intentionalCloseRef` shared by an old and a new socket |
| Same derivation in many places | "Is it running?" computed differently in several components, so they disagree on screen |
| Clear after await | Snapshot input, await upload, then `clear()`: anything typed during the await is lost |

## Report additions

For each finding also give: **States** (listed), **Triggers** (what moves between them), **What makes it implicit** (which flags or conditions), and a concrete bad sequence: "A happens, then B, result C". Close with the explicit models already in the codebase to copy, and a fix order: quick deletions first, then shared guards, then refactors.

## Fix patterns

Offer these when the user asks to fix. Each one has a regression test that drives the bad sequence.

| Problem | Pattern |
|---|---|
| Scattered transitions | One module of transition predicates (`canRequestStart`, `shouldApplyFailure`) that every writer calls. Keep it pure and small |
| Stale async writes | An attempt number: each request bumps it, passes it through the job, and the job's writes are ignored unless it still matches. Keep it optional for jobs already in flight during deploy |
| Terminal overwritten | "Terminal is final": every writer checks `isTerminal(current)` first |
| Two actors, one field | The actor owns only the value it set: a run resets `in_progress`, never a status the user picked |
| No exit | Schedule the attempt's own failure write at request time, fenced by the attempt number, so it no-ops when the attempt settled |
| Shared busy slot | Check the slot is free before starting (read the job's real status, not just "id present"); cancel only when your kind holds it |
| Orphaned resources | When a write is ignored, delete the resource only that attempt created; leave a shared one alone |
| Client async after cancel | A generation counter bumped by start, stop and unmount; every await checks it |
| Effect re-fires | A ref keyed on the data that triggered the effect (for example the message index), so one trigger starts one action |
| Sticking loading | Every await that set loading has a catch that resets it and shows an error |
| Boolean clusters | A discriminated union plus a small pure reducer, with a unit test of the reducer |
| Re-derived checks | One shared function with explicit inputs; surface-specific extras become named parameters, never silent differences |
| Public setters with no callers | Delete them |

## Pitfalls

- Fixing a guard can break an untokened caller that relied on the old loose rule. Grep every caller of a mutation before tightening it.
- A cleanup that deletes "untracked" resources can delete one a caller is about to use. Only delete when the caller has a token proving the resource is its own.
- A new import between modules can add an import cycle. Put shared helpers in a leaf module.
- Contract tests that grep source text break on harmless moves. Update the anchor; keep the guarantee.
- Access checks are often missing on the same functions as state guards. When a public function takes an id, check it verifies the caller can access that entity.
- A durable workflow step may still run after its workflow was cancelled. Check this before you rely on cancel to stop a write.
- New arguments and fields must be optional so workflows already in flight replay unchanged after deploy. Say so in the report.
- Unit tests do not reach real races. When a fix touches a sandbox, VM or other paid resource, ask before a real end-to-end test, name the resource you will use, and stop it afterwards. In one past run that test found a bug the unit tests missed.
