# Vercel Sandbox spikes

Two standalone go/no-go benchmarks, both isolated from the Convex backend:

| Script                    | Question                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| `spike.mjs`               | Phase 0 — is Vercel Sandbox a viable Daytona replacement? (**answered: yes**) |
| `managed-image-spike.mjs` | Phase 1 — can eva move off `runtime: "node24"` to a managed Ubuntu image?     |

See [Managed Images spike](#managed-images-spike-phase-1) for the second one.

## Phase 0 — Daytona → Vercel Sandbox

Go/no-go benchmark for the Daytona → Vercel Sandbox migration. See the plan at
`~/.claude/plans/i-think-we-need-enchanted-biscuit.md`.

## What it measures

The migration's whole premise is that Vercel restores a heavy snapshot (whole
codebase + `node_modules` + local DB state) in **seconds**, not the minutes
Daytona takes. This script:

1. Builds a realistic "heavy" sandbox — clone a large repo, install deps,
   best-effort start Docker + a seeded Postgres — then `snapshot()` it.
2. Restores from that snapshot several times to separate **cold-cache** from
   **warm-cache** latency.
3. Probes the capabilities eva depends on that Vercel does not clearly document:
   - **inbound WebSocket** through a per-port public URL (our preview proxy and
     local-Convex `/__convex` routing need this),
   - **detached long-running process + re-attach** (our callback agent runner).

It writes a timing table to stdout and `spike-results.json`.

## Prerequisites

- Node 22+ (uses the global `WebSocket` client).
- A throwaway Vercel **Pro** project (Hobby caps sessions at 45 min).
- An access token scoped to that project.

## Run

```bash
cd packages/backend/scripts/vercel-sandbox-spike
pnpm install                      # installs @vercel/sandbox in an isolated dir

export VERCEL_TOKEN=...            # Vercel access token
export VERCEL_TEAM_ID=team_...
export VERCEL_PROJECT_ID=prj_...
export SPIKE_RUN_TS=$(date -u +%FT%TZ)   # stamped into results (script can't call Date.now at import)

# optional overrides
# export SPIKE_REPO_URL=https://github.com/your-org/your-heavy-repo.git
# export SPIKE_WARM_RUNS=5
# export SPIKE_RUNTIME=node24

pnpm spike
```

## Reading the verdict

`spike-results.json` ends with a `verdict` block against the plan's thresholds:

| Check                | Target                                         |
| -------------------- | ---------------------------------------------- |
| `warmUnder3s`        | warm-cache restore median ≤ 3s                 |
| `coldUnder30s`       | cold-cache restore ≤ 30s                       |
| `websocketOk`        | inbound WS over the public port URL works      |
| `detachedReattachOk` | `getCommand` re-attaches to a detached process |

If restore latency fails, run the same shape of test on **Morph** (claims
<250 ms full-VM branch/restore) before deciding — see the plan's fallback note.

## Caveats

- A few SDK call shapes are marked `VERIFY` in `spike.mjs` (the `source`
  snapshot shape, `ports` param, detached command id field, `getCommand`
  signature, `sandbox.domain()` return). The first real run confirms them
  against the installed `@vercel/sandbox` types; all such calls funnel through
  the thin wrappers at the top of the file, so fixes are one-line.
- Docker-in-sandbox and the seeded DB are **best-effort**; failures there are
  logged and do not abort the restore benchmark.
- This harness is intentionally isolated from the Convex backend — it shares no
  code and its own `package.json` keeps `@vercel/sandbox` out of the backend
  dependency tree until we commit to the migration.

## Managed Images spike (Phase 1)

`managed-image-spike.mjs` decides whether eva can swap `runtime: "node24"`
(Amazon Linux 2023) for `image: "vercel/sandbox/universal:<tag>"` (Ubuntu
26.04). It boots one sandbox of each flavour and compares them.

### What it measures

| #   | Check                                     | Why it matters                                                                   |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Boot time, managed vs `node24`            | Migration must not slow session start                                            |
| 2   | `whoami`, `$HOME`, `/vercel/sandbox`      | eva hardcodes the user and workdir in several modules — **sizes the migration**   |
| 3   | Snapshot round-trip on Ubuntu             | eva's whole lifecycle is snapshot-based                                           |
| 4   | Restore an **AL2023** snapshot under v3   | **Blocker.** Prod snapshots are all AL2023; if this fails, every repo re-seeds    |
| 5   | `apt-get` of eva's toolchain              | Tells us which AL2023 workarounds (gh tarball, ffmpeg SPAL, libjack) can be dropped |
| 6   | IPv4 egress / no IPv6                     | eva's sandboxes are IPv4-only                                                    |
| 7   | `ports` + per-port public URL             | Preview proxy depends on it                                                      |
| Q1  | Preinstalled coding agents + npm prefixes | Conflict risk with eva's callback bundle installing its own CLIs                  |
| Q3  | `sudo`, `detached` + `getCommand`, `env`  | Exec semantics eva relies on everywhere                                          |

Check 4 needs no prod data: the script creates an AL2023 sandbox with the
deprecated `runtime` property, snapshots it with SDK v3, and restores it. Set
`SPIKE_LEGACY_SNAPSHOT_ID` to additionally restore a real eva seeded snapshot.

### Run

```bash
cd packages/backend/scripts/vercel-sandbox-spike
pnpm install

export VERCEL_TOKEN=... VERCEL_TEAM_ID=team_... VERCEL_PROJECT_ID=prj_...
export SPIKE_RUN_TS=$(date -u +%FT%TZ)

# optional
# export SPIKE_IMAGE=vercel/sandbox/universal:latest
# export SPIKE_LEGACY_SNAPSHOT_ID=snap_...   # also restore a real eva snapshot
# export SPIKE_SKIP_APT=1                    # skip the slow apt stage

pnpm managed-image-spike     # writes managed-image-results.json
node cleanup.mjs             # delete sandboxes + snapshots afterwards
```

The apt stage installs group-by-group and, on failure, retries package-by-package
so the output names the exact Ubuntu package whose name drifted (e.g.
`libasound2` → `libasound2t64`). That list is the input to the Phase 2 seed
rewrite.

### Reading the verdict

`legacyAl2023SnapshotRestores` and `userIsUbuntu` /
`legacyWorkdirStillExists` decide the shape of the migration. If the AL2023
restore fails, Phase 2 becomes repo-by-repo re-seeding rather than a library
bump. All sandboxes are stopped on exit; snapshots persist until `cleanup.mjs`.

Phase 2 is implemented and on by default: fresh sandboxes boot the managed
Ubuntu image. See the "Phase 2 status" section of `MANAGED-IMAGE-RESULTS.md`,
and note that check 5's apt output is the ground truth
for `PACKAGE_ALIASES` in `convex/_sandbox_runtime/packageManager.ts`.
