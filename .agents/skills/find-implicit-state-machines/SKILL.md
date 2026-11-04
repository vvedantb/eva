---
name: find-implicit-state-machines
description: "Audit a codebase for implicit state machines: lifecycles spread across boolean flags, status fields patched from many files, timestamps that can disagree with status, effect chains, and ad-hoc retry or polling flags. Use when the user asks to find implicit state machines, hunt race conditions or stuck states, or audit stateful logic. Read-only by default; produces a ranked findings list. For writing new stateful code, use principle-model-the-domain instead."
---

# Find Implicit State Machines

An implicit state machine is a lifecycle whose states and transitions are not written down in one place. The states live in a mix of flags, optional fields and status strings. The transitions are writes scattered across files. Nothing says which combinations are legal, so illegal ones happen: a cancelled run marked successful, a stop undone by a slow start, a spinner that never ends.

This skill finds them, ranks them, and proposes the fix. It does not edit code unless the user asks.

## 1. Scope the search

Split the codebase by layer and search each in parallel (one subagent per layer when the repo is large):

- **Server / data layer**: schema first. List every table or model with a `status`, `state`, `phase` or `kind` field, or with lifecycle timestamps (`startedAt`, `finishedAt`, `cancelledAt`, `archivedAt`, `deletedAt`). Then find every write to those fields.
- **Client / UI layer**: components and hooks with several `useState` / `useRef` values that change together, and hooks that drive async flows.

Tell each searcher what is already ruled out, and ask for file:line evidence on every claim.

## 2. Signals

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

## 3. Verify before reporting

Read the code for every finding before you report it. Searchers miss guards in helpers and misread line numbers. For each finding confirm:

1. The exact writes (file:line) and whether any guard exists.
2. A concrete bad sequence: "A happens, then B, result C".
3. Whether a test or comment already documents the behaviour as intended.

Mark findings you verified by reading code, and those you have not. Never present a race as reproduced unless you ran it.

## 4. Report

Group by feature area, most severe first. For each finding:

- **Where**: file:line of the field and of the key writers.
- **States**: the implied states, listed.
- **Triggers**: what moves between them.
- **What makes it implicit**: which flags or conditions.
- **Risk**: the concrete bad sequence.
- **Severity**: high (data loss, duplicate side effects, security, stuck UI likely), medium (reachable bad state), low (design smell).

Close with:
- the explicit models already in the codebase (a transition table, a fenced writer) to copy;
- a suggested fix order (quick deletions first, then shared guards, then refactors).

A table is good for the top ten; prose for the rest.

## 5. Fix patterns

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

## 6. Pitfalls seen in practice

- Fixing a guard can break an untokened caller that relied on the old loose rule. Grep every caller of a mutation before tightening it.
- A cleanup that deletes "untracked" resources can delete one a caller is about to use. Only delete when the caller has a token proving the resource is its own.
- A new import between modules can add an import cycle. Put shared helpers in a leaf module.
- Contract tests that grep source text break on harmless moves. Update the anchor; keep the guarantee.
- Access checks are often missing on the same functions as state guards. When a public function takes an id, check it verifies the caller can access that entity.
