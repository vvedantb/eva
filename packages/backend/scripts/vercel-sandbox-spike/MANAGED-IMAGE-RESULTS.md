# Phase 1 spike — Managed Images (Ubuntu): results

**Status: RUN. All twelve verdict checks passed on 2026-09-02 against
`@vercel/sandbox` 3.0.0 and `vercel/sandbox/universal` (Ubuntu 26.04 LTS).
The AL2023-restore blocker is cleared. Phase 2 is implemented and still gated —
see "Phase 2 status" below.**

## Live verdict (2026-09-02, SDK 3.0.0)

| Check                          | Result | Note                                                              |
| ------------------------------ | ------ | ----------------------------------------------------------------- |
| `legacyAl2023SnapshotRestores`  | ✅ true | **The blocker.** An AL2023 snapshot restores under v3 unchanged — marker survived, 157 ms. No re-seed needed. |
| `bootNoSlower`                  | ✅ true | create 206 ms (AL2023) vs 277 ms (managed); first exec 102 vs 103 ms. |
| `userIsUbuntu`                  | ✅ true | `Ubuntu 26.04 LTS`, image digest `sha256:0e3e3617…`.               |
| `legacyWorkdirStillExists`      | ⚠️ **false** | `/vercel/sandbox` does **not** exist on the managed image — see "What differs" below. |
| `workspaceMkdirOk`              | ✅ true | `/tmp/repo` is creatable, so eva's `WORKSPACE_DIR` is unaffected.  |
| `ubuntuSnapshotRoundTrip`       | ✅ true | 1.35 GB captured in 5.5 s, restored in 249 ms.                     |
| `ipv4EgressOk` / no IPv6        | ✅ true | IPv4 only, `gaiPrefersV4` true — matches eva's assumption.         |
| `portUrlOk`                     | ✅ true | Per-port public URL served 200.                                    |
| `detachedReattachOk`            | ✅ true | `detached` + `getCommand` unchanged.                               |
| `sudoFlagOk`                    | ✅ true | Passwordless sudo on both images.                                  |
| `ffmpegWithoutHacks`            | ✅ true | Plain `apt-get install ffmpeg` works — no SPAL repo, no libjack repair. |
| `ghWithoutTarball`              | ✅ true | `gh` is preinstalled (2.97) and apt upgrades it to 2.99.           |

## What differs between the two images

|                | AL2023 (`runtime: node24`) | Ubuntu managed image |
| -------------- | -------------------------- | -------------------- |
| user           | `vercel-sandbox`            | `ubuntu`             |
| `$HOME`        | `/home/vercel-sandbox`      | `/vercel`            |
| default cwd    | `/vercel/sandbox`           | `/vercel`            |
| `/vercel/sandbox` exists | yes             | **no**               |
| relative writes land in | `/vercel/sandbox`  | `/vercel`            |

Two consequences, both already handled:

- `EVA_ENV_FILE` (`/vercel/sandbox/.eva-env.sh`) still works — the probe
  confirmed `evaEnvFileWritable: true`, because `writeFiles` creates the parent
  directory. `SOURCE_ENV` is `[ -f … ] &&`-guarded, so a missing file is inert.
- The interactive-shell hook appended only to `/home/eva/.bashrc`, which is an
  eva-created directory rather than any real user's home — nothing reads it on
  either image. It now also targets `"$HOME/.bashrc"`.

`/home/eva` itself is fine: the seed `sudo mkdir -p`s it and sudo is
passwordless on both.

## Already on the managed image (no install needed)

`node 24.19`, `npm 11.17`, `pnpm 11.20`, `bun 1.3.14`, `git 2.53`,
`git-lfs 3.7.1`, `jq 1.8.1`, `gh 2.97`, `python3 3.14`, `pip`, `curl`, `tar`,
`gzip`, `vim` — plus `claude 2.1.224`, `codex 0.147.0` and `opencode 1.18.15`.
Global npm prefix is `/vercel/.global/npm` and `/usr/local/bin` is writable, so
eva's own global installs do not collide.

Still missing and installed by eva: `gcc`, `g++`, `make`, `docker`, `ffmpeg`,
the VNC stack, `xterm`, Chrome.

### Q1 — preinstalled CLIs vs eva's pins: resolved

The image's `claude`/`codex`/`opencode` live under the sandbox user's global npm
prefix (`/vercel/.global/npm`), while the seed's `sudo npm install -g` writes to
node's own prefix. Main hit the same root-vs-user split on AL2023 and fixed it
by design, which also covers Ubuntu:

- `globalPackageIsVersion` (snapshotActions.ts) and `globalNpmRoots()`
  (callback-src/providers/claudeSdk.ts) check **both** roots, and the first
  root holding the exact pin wins — the image's drifted copies are ignored.
- Claude and Codex are installed per launch into `/tmp/claude-cli` /
  `/tmp/codex-cli`, which `AGENT_CLI_PATH_LINE` puts first on `PATH`.

This branch briefly redirected the seed install to the user prefix instead; that
was dropped as redundant once main's two-root design landed.

## Static findings (from the v3 type declarations)

Confirmed by the run above; kept for the reasoning.

## Answered without a live run (`@vercel/sandbox` 3.0.0 types)

| Question                              | Finding                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is `runtime` really still accepted?   | Yes. `RuntimeOrImage` is a union: `{ runtime?: RUNTIMES \| (string & {}); image?: never }` \| `{ runtime?: never; image?: SandboxImage }`. `runtime` is `@deprecated`, not removed. |
| Does the snapshot path change?        | **No.** The `source: { type: "snapshot", snapshotId }` variant forbids *both* `runtime` and `image`, exactly as in v2. eva's restore call compiles unchanged. |
| Default when neither is passed?       | `vercel/sandbox/universal:latest` — i.e. **Ubuntu, not AL2023**. eva must set `image` explicitly rather than relying on a default.                    |
| Valid managed image names             | `ManagedImage = "universal" \| "node:22" \| "node:24" \| "node:26" \| "python:3.14" \| "ubuntu" \| "arch"`, used as `` `vercel/sandbox/${ManagedImage}` ``. Note the **colon** (`node:24`, not `node24`). |
| Version/digest pinning                | `SandboxImage` widens to `(string & {})`, so `vercel/sandbox/universal:<tag>` and `...@sha256:...` both typecheck. No cast needed for a pinned tag.   |
| Q3 — `runCommand` semantics           | `RunCommandParams` is **unchanged**: `cmd`, `args`, `cwd`, `env`, `sudo`, `detached`, `stdout`, `stderr`, `signal`, `timeoutMs`. Detached + `getCommand(cmdId)`, `domain(port)`, `mkDir`, `writeFiles`, `snapshot`, `stop` all still exist with the same shapes. |
| v2.4.0 → v3.0.0 export surface        | **Additive only**: `SandboxUser`, `SandboxUserAlreadyExistsError`, `ExecutionContext`. Nothing eva imports was removed or renamed.                    |
| New in v3 worth knowing               | `Sandbox.fork()`, `Sandbox.getOrCreate()`, `createUser()` / `asUser()`. Not needed for this migration.                                               |
| Working directory                     | **Not settled by types.** `Sandbox.cwd` is documented as "e.g. `/vercel/sandbox`" and `writeFiles` still says relative paths land in `/vercel/sandbox` — suggestive, not authoritative for the Ubuntu image. Live check 2 must confirm. Note the SDK exposes `sandbox.cwd`, so eva can read the workdir instead of hardcoding it. |

**Implication:** the library bump itself (plan Phase 2 step 1) is low risk — no
breaking changes on any API eva uses. The risk is concentrated in the two
environment facts only a live run can settle: the container user/home and
whether AL2023 snapshots still restore.

## Check 4 against real prod data — settled

The first run's check 4 restored a snapshot the script had made itself. A second
run (same day) restored a **real prod snapshot**: cost-model-ts's base snapshot,
2.75 GB, written 22 Jul 2026 by SDK **2.4.0** (what prod ran at the time),
Amazon Linux 2023.11, with `/tmp/repo/.git` and `claude 2.1.217` baked in. It
restored under SDK 3.0.0 in **8.1 s** (cold cache — the tiny self-made one took
159 ms warm), booted as `vercel-sandbox`, and the repo was present. Nothing
about the SDK that *wrote* a snapshot affects whether v3 can *restore* it.

Two things learned along the way, worth knowing before anyone repeats this:

- **Snapshot visibility is team-scoped; restore is project-scoped.**
  `Snapshot.get` returned the eva repo's snapshot from every project on the
  team, but `Sandbox.create({ source: { type: "snapshot" } })` 404'd from any
  project other than its owner. A 404 on restore therefore means "wrong
  project", not "incompatible snapshot" — the harness's `prodSnapshot.ok: false`
  reads identically for both, so check `Snapshot.get` first.
- **eva runs one Vercel project per repo.** Each project's sandboxes carry a
  single `eva.repoId` tag. To restore a repo's snapshot, use that repo's
  `VERCEL_PROJECT_ID`, not any project on the team.

Note the harness's `legacyAl2023SnapshotRestores` verdict is computed from the
self-created snapshot only; read `snapshots.legacy.prodSnapshot` in the JSON for
the prod answer.

## Notes for whoever runs it

- Run it against a **throwaway** Vercel project, not eva prod: it creates
  sandboxes, snapshots them, and installs a Google apt repo.
- `SPIKE_SKIP_APT=1` gets checks 1-4, 6-7 in a couple of minutes; the apt stage
  is the slow part.
- Pass `SPIKE_LEGACY_SNAPSHOT_ID=snap_...` (a real eva seeded snapshot) to make
  check 4 conclusive for prod data rather than only for a snapshot the script
  created itself.
- Do **not** ship the image change if `legacyAl2023SnapshotRestores` is
  false — that turns a library bump into a repo-by-repo re-seed.

## Phase 2 status — implemented, on by default

Phase 2 is in the backend and on by default. There is no switch.

| Step | State |
| ---- | ----- |
| `@vercel/sandbox` 2.4.0 → 3.x | Done. No call-site changes were needed, as the type audit above predicted. |
| `runtime` → `image` at create | Done. Every fresh sandbox boots `vercel/sandbox/universal:latest` (`VERCEL_SANDBOX_IMAGE` in `vercelProvider.ts`). |
| dnf → distro-neutral installs | Done. Every install goes through `convex/_sandbox_runtime/packageManager.ts`. A contract test fails the build on a direct `dnf install` or `apt-get install`. |
| AL2023 workarounds | Kept for AL2023 snapshots: SPAL + libjack (ffmpeg), the gh yum repo, the Chrome `.repo` file, the code-server `.rpm`. Ubuntu skips them. |
| Re-seed every repo | Not needed. AL2023 snapshots restore under v3 (check 4, including a real prod snapshot). |

### How repos move to Ubuntu

Snapshot restores never pass an image. A repo moves only when its base Image is
rebuilt from a fresh sandbox:

- Repos **without** Stop Commands rebuild the base on every scheduled build, so
  they move on their next nightly run.
- Repos **with** Stop Commands move when someone clicks Settings → Snapshots →
  **Rebuild Now**. Scheduled builds only re-seed on the existing base.
- Until then, sessions keep booting the repo's existing AL2023 snapshot, which
  still works.

There is no rollback switch. To go back, revert the image constant in code.

`latest` is patched nightly by Vercel. Each snapshot freezes what it captured,
so an image change reaches a repo only on its next base rebuild.
