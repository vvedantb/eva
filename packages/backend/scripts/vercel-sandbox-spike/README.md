# Vercel Sandbox spikes

Standalone go/no-go benchmark, isolated from the Convex backend.

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
