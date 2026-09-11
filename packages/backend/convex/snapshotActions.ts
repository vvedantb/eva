"use node";

import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  resolveSandboxCredentials,
  tryResolveSandboxCredentials,
} from "./envVarResolver";
import { getInstallationToken } from "./githubAuth";
import {
  buildConfigFileDownloadCommands,
  filterDownloadableConfigFiles,
  execHandle,
  getSandboxHandle,
  type SandboxConfigFile,
} from "./_sandbox_runtime/helpers";
import {
  createSandboxAndPrepareRepo,
  SESSION_LIFECYCLE,
} from "./_sandbox_runtime/git";
import { getSandboxClient } from "./_sandbox/factory";
import { FFMPEG_INSTALL_SCRIPT } from "./_sandbox/ffmpegInstall";
import {
  COREPACK_SANDBOX_ENV,
  renderEvaEnvFile,
} from "./_sandbox/vercelEnvFile";
import {
  buildConvexBackgroundScriptBody,
  buildConvexPostSeedPushLines,
  isConvexBackendCommand,
  CONVEX_FUNCTIONS_READY_LOG_LINE,
  CONVEX_LOCAL_BACKEND_HEALTH_URL,
} from "./_sandbox_runtime/convexLocalBackend";
import {
  buildEnsureSwapScript,
  releaseSwapFile,
  resolveSwapConfig,
} from "./_sandbox_runtime/swap";
import { CLAUDE_CODE_VERSION } from "./_sandbox_runtime/claudeCliVersion";
import { Sandbox, Snapshot } from "@vercel/sandbox";
import { SANDBOX_TAG } from "./_sandbox/tags";

const SEED_PREP_LABEL_KEY = SANDBOX_TAG.purpose;
const SEED_PREP_LABEL_VALUE = "snapshot-seed-prep";

// Pinned Supabase CLI version installed on fresh Vercel sandboxes (no base
// toolchain baked in).
const SUPABASE_CLI_VERSION = "2.90.0";
// Pinned GitHub CLI for Vercel seeds. Amazon Linux dnf repos don't ship it,
// so we install the official release tarball, then the gh yum repo if that
// download dies.
const GH_CLI_VERSION = "2.72.0";
// GitHub Releases over HTTP/2 from a Vercel sandbox dies mid-transfer
// (`curl: (56) Connection died, tried 5 times`). HTTP/1.1 has no stream
// layer to fail; `--retry-all-errors` covers 56, which `--retry` alone skips.
const GITHUB_RELEASE_CURL =
  "curl -fSL --http1.1 --retry 5 --retry-delay 5 --retry-all-errors";
// A direct github.com release URL and the release-asset API take different
// request paths before reaching the artifact CDN. Vercel's IPv4-only
// sandboxes intermittently receive an empty reply from the direct path, so
// retry every pinned artifact through GitHub's official asset API before
// declaring the toolchain stage failed.
const GITHUB_RELEASE_DOWNLOAD_FUNCTION = `github_release_download() {
  local repo="$1" tag="$2" asset="$3" output="$4" asset_url
  ${GITHUB_RELEASE_CURL} -o "$output" "https://github.com/$repo/releases/download/$tag/$asset" && return 0
  echo "Direct GitHub release download failed; retrying through release asset API"
  asset_url=$(${GITHUB_RELEASE_CURL} "https://api.github.com/repos/$repo/releases/tags/$tag" | jq -r --arg asset "$asset" '.assets[] | select(.name == $asset) | .url' | head -n 1)
  [ -n "$asset_url" ] && [ "$asset_url" != "null" ] || return 1
  ${GITHUB_RELEASE_CURL} -H "Accept: application/octet-stream" -H "X-GitHub-Api-Version: 2022-11-28" -o "$output" "$asset_url"
}`;
// Search and VCS tooling the agent CLIs shell out to. Like gh, none of these
// are in the AL2023 repos, so each comes from its pinned upstream tarball.
// Note the differing tag conventions: ripgrep tags have no `v` prefix, and
// git-lfs drops the `v` from its archive's top-level directory.
const RIPGREP_VERSION = "15.2.0";
const FD_VERSION = "10.4.2";
const GIT_LFS_VERSION = "3.7.1";
const CODE_SERVER_VERSION = "4.132.0";
// Keep the launcher, its platform package and @opencode-ai/sdk in lockstep:
// the SDK is a generated client for one server release, and npm briefly exposed
// opencode-ai 1.18.17 before any matching linux package existed, so `latest`
// made every fresh snapshot fail deterministically during postinstall. Mirror
// any bump in callback-src/providers/opencodeSdk.ts (SDK_VERSION).
const OPENCODE_VERSION = "1.18.16";
// Mirror any bump in callback-src/providers/{claudeSdk,cursorSdk}.ts
// (SDK_VERSION): the callback's stream parsers match one SDK release's message
// shapes exactly. Bump CLAUDE_CODE_VERSION (_sandbox_runtime/claudeCliVersion)
// alongside the agent SDK — 0.3.X ships the CLI it spawns, 2.1.X.
const CLAUDE_AGENT_SDK_VERSION = "0.3.258";
const CURSOR_SDK_VERSION = "1.0.28";

/**
 * Shell test that a globally installed package is at an exact version.
 *
 * Seeding used to test only that the package directory existed, so a snapshot
 * built before a pin moved kept serving the stale SDK forever. That drift is
 * silent rather than fatal: the callback's parsers drop every event they do not
 * recognise, so the turn renders no activity at all while still returning its
 * final answer.
 *
 * Two roots are tested, because the install below is `sudo npm install -g`,
 * which writes to node's own prefix (`/vercel/runtimes/node24/lib/node_modules`
 * on a Vercel sandbox), while this guard runs as the unprivileged sandbox user
 * whose `npm root -g` is a per-user prefix holding only pnpm. Testing `npm root
 * -g` alone therefore never matched, so every seed reinstalled the whole
 * toolchain. Mirrors `globalNpmRoots()` in
 * callback-src/providers/claudeSdk.ts. The node-derived root is computed inside
 * node to avoid nesting shell quotes in the `node -p` argument.
 *
 * Braced because the caller chains these with `&&` before an `|| sudo npm
 * install` fallback: a bare `[ a ] || [ b ]` would re-associate and let one
 * package's second test satisfy another package's first.
 */
function globalPackageIsVersion(name: string, version: string): string {
  const nodePrefixRoot =
    "require('path').dirname(require('path').dirname(process.execPath)) + '/lib/node_modules'";
  const atNodePrefix = `"$(node -p "require(${nodePrefixRoot} + '/${name}/package.json').version" 2>/dev/null)"`;
  const atNpmRoot = `"$(node -p "require('$(npm root -g)/${name}/package.json').version" 2>/dev/null)"`;
  return `{ [ ${atNodePrefix} = "${version}" ] || [ ${atNpmRoot} = "${version}" ]; }`;
}

function shouldCaptureSupabaseState(commands: string[]): boolean {
  return commands.some((command) => {
    const lower = command.toLowerCase();
    return (
      lower.includes("supabase") ||
      lower.includes("start-db") ||
      lower.includes("seed:sql")
    );
  });
}

/**
 * Startup cmds that must run after background daemons.
 * Only a pure filesystem move (the ENTIRE command is one `mv` of a
 * sandbox-config file into the repo, nothing chained) can run before daemons.
 * Chained commands (e.g. `mv …data.sql … && pnpm seed:sql && rm …`) must stay
 * post-daemon: the chained work needs daemon-started services (Postgres,
 * `convex dev`'s CONVEX_DEPLOYMENT bootstrap for `npx convex env/import`).
 */
function startupCommandNeedsDaemon(command: string): boolean {
  return !/^\s*mv\s+\S*sandbox-config\/\S+\s+\S+\s*$/.test(command);
}

function seededRuntimeStateCaptureLines(
  requireSupabaseDump: boolean,
): string[] {
  return [
    'echo "SEEDRUN-STAGE:capture-runtime-state"',
    `REQUIRE_SUPABASE_DUMP=${requireSupabaseDump ? "1" : "0"}`,
    "mkdir -p /home/eva/.eva-snapshot-state",
    "rm -f /home/eva/.eva-snapshot-state/supabase-db-web.pg_dump.sql.gz",
    'if [ "$REQUIRE_SUPABASE_DUMP" != "1" ]; then',
    '  echo "repo does not require Supabase state capture; skipping"',
    "elif ! docker ps --filter name=supabase_db_web --filter status=running -q | grep -q .; then",
    // Fall back to a from-scratch start when `docker start` fails — a warm
    // prep sandbox can carry a half-cleaned docker state (stopped container
    // whose network was pruned by a prior `supabase stop`).
    "  if ! { docker ps -a --filter name=supabase_db_web -q | grep -q . && docker start supabase_db_web >/dev/null 2>&1; }; then",
    "    docker ps -aq --filter name=supabase | xargs -r docker rm -f",
    "    ( cd /tmp/repo && pnpm start-db ) || true",
    "  fi",
    "fi",
    'if [ "$REQUIRE_SUPABASE_DUMP" = "1" ]; then',
    "  for i in $(seq 1 240); do docker exec supabase_db_web pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done",
    '  docker exec supabase_db_web pg_isready -U postgres >/dev/null 2>&1 || { echo "SEEDRUN-FAILED:capture-runtime-state"; exit 1; }',
    "  dump_supabase_public_data() { ( set -o pipefail; docker exec supabase_db_web pg_dump -U postgres -d postgres --schema=public --data-only --no-owner --no-privileges | gzip -1 > /home/eva/.eva-snapshot-state/supabase-db-web.pg_dump.sql.gz ); }",
    "  count_supabase_dump_rows() { gzip -dc /home/eva/.eva-snapshot-state/supabase-db-web.pg_dump.sql.gz | awk 'BEGIN{in_copy=0;c=0} /^COPY public\\./{in_copy=1;next} /^\\\\\\.$/{in_copy=0;next} in_copy{c++} END{print c}'; }",
    '  dump_supabase_public_data || { echo "SEEDRUN-FAILED:capture-runtime-state"; exit 1; }',
    "  SUPABASE_DUMP_ROWS=$(count_supabase_dump_rows)",
    '  if [ "$SUPABASE_DUMP_ROWS" = "0" ] && [ -f packages/db/data.sql ]; then echo "Supabase dump was empty; rerunning pnpm seed:sql before capture"; pnpm seed:sql || { echo "SEEDRUN-FAILED:capture-runtime-state"; exit 1; }; dump_supabase_public_data || { echo "SEEDRUN-FAILED:capture-runtime-state"; exit 1; }; SUPABASE_DUMP_ROWS=$(count_supabase_dump_rows); fi',
    '  if [ "$SUPABASE_DUMP_ROWS" = "0" ]; then echo "SEEDRUN-FAILED:capture-runtime-state"; exit 1; fi',
    '  echo "supabase_dump_rows=$SUPABASE_DUMP_ROWS"',
    "  ls -lh /home/eva/.eva-snapshot-state/supabase-db-web.pg_dump.sql.gz",
    "fi",
  ];
}

// Bump when the Vercel seed-prep toolchain/build inputs change in a way that
// should invalidate existing image fingerprints (see getImageFingerprint)
// even though repo/config inputs are unchanged.
const IMAGE_DEF_VERSION = 2;

// Boundary schema for the small GitHub JSON responses this module reads.
const shaResponseSchema = z.object({ sha: z.string() });

/** Manifest files that affect baked install output (Node lockfiles + Python). */
const FINGERPRINT_MANIFEST_FILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "requirements.txt",
  "pyproject.toml",
] as const;

/**
 * Fingerprint of the Image inputs: every dependency manifest blob sha found on
 * the build branch (Node lockfiles + Python), the build commands, the
 * config-file blobs baked into the image, and IMAGE_DEF_VERSION. When this
 * matches the value stored at the last successful Image build, the workflow
 * skips the ~11-15m rebuild — the output would be byte-identical (sandboxes
 * fetch fresh branches at boot, so a repo checkout that is a few commits stale
 * costs nothing; node_modules / site-packages only drift when a manifest
 * changes, which changes this fingerprint). Returns null when the inputs
 * cannot be determined (e.g. no manifests found) — callers must treat null as
 * "always rebuild".
 */
export const getImageFingerprint = internalAction({
  args: { repoSnapshotId: v.id("repoSnapshots") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const config = await ctx.runQuery(
      internal.repoSnapshots.getRepoSnapshotInternal,
      { repoSnapshotId: args.repoSnapshotId },
    );
    if (!config) return null;
    const repo = await ctx.runQuery(internal.repoSnapshots.getRepo, {
      repoId: config.repoId,
    });
    if (!repo) return null;
    const branch = config.workflowRef ?? "main";
    const manifestShas: string[] = [];
    try {
      const token = await getInstallationToken(repo.installationId);
      for (const manifest of FINGERPRINT_MANIFEST_FILES) {
        const resp = await fetch(
          `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${manifest}?ref=${encodeURIComponent(branch)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
            },
          },
        );
        if (resp.ok) {
          const parsed = shaResponseSchema.safeParse(await resp.json());
          if (parsed.success) {
            manifestShas.push(`${manifest}:${parsed.data.sha}`);
          }
        }
      }
    } catch (e) {
      console.error(
        `[snapshot] image fingerprint: manifest lookup failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
    }
    if (manifestShas.length === 0) return null;
    const fileKeys: string[] = await ctx.runQuery(
      internal.sandboxConfigFiles.getConfigFileKeys,
      { repoId: config.repoId },
    );
    const payload = JSON.stringify({
      v: IMAGE_DEF_VERSION,
      branch,
      manifestShas,
      buildCommands: config.buildCommands ?? [],
      files: fileKeys,
    });
    let hash = 5381;
    for (let i = 0; i < payload.length; i++) {
      hash = (hash * 33) ^ payload.charCodeAt(i);
    }
    return `img-${(hash >>> 0).toString(36)}-${payload.length}`;
  },
});

/**
 * Seeded-snapshot build — LAUNCH step. Composes the app's whole seed sequence
 * (startup commands → marker → stop commands) into one bash script and launches
 * it DETACHED on the prep sandbox (setsid nohup), returning immediately.
 *
 * Convex actions have a hard 600s ceiling, so running seed commands
 * synchronously inside actions caps every command at ~9 minutes — cold docker
 * pulls and slow readiness waits blew through it repeatedly on prod. Detached,
 * the script takes as long as it needs; the workflow polls pollSeedRun for the
 * outcome markers, mirroring the trigger+poll pattern used for captures.
 */
export const launchSeedRun = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    // Branch to hard-reset /tmp/repo to (refs must already be fetched — the
    // workflow runs sandbox.fetchBaseBranch first, which owns git auth).
    branch: v.string(),
    // Repo build commands (pnpm install / codegen etc), run after the reset so
    // the captured snapshot carries fresh node_modules and build artifacts.
    buildCommands: v.array(v.string()),
    // Seed-once commands (env set, convex import) run in the post-daemon phase
    // so services like `convex dev` are up. Build-time only — sandbox boots
    // never re-run these, unlike startup commands.
    seedCommands: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Validates Vercel credentials are configured for this repo; the sandbox
    // handle itself is resolved separately below via getSandboxHandle.
    await resolveSandboxCredentials(ctx, args.repoId);
    const startupCommands: string[] | null = await ctx.runQuery(
      internal.repoSnapshots.getStartupCommands,
      { repoId: args.repoId },
    );
    const backgroundCommands: string[] | null = await ctx.runQuery(
      internal.repoSnapshots.getBackgroundCommands,
      { repoId: args.repoId },
    );
    const stopCommands: string[] | null = await ctx.runQuery(
      internal.repoSnapshots.getStopCommands,
      { repoId: args.repoId },
    );
    const requireSupabaseDump = shouldCaptureSupabaseState([
      ...(startupCommands ?? []),
      ...(backgroundCommands ?? []),
      ...(stopCommands ?? []),
    ]);
    const lines: string[] = [
      "#!/bin/bash",
      "exec > /tmp/seedrun.log 2>&1",
      "set -x",
      // Same Corepack env as the session env file: never fetch npm `latest`
      // for an unpinned repo, never hang on the download prompt.
      renderEvaEnvFile(COREPACK_SANDBOX_ENV).trimEnd(),
      GITHUB_RELEASE_DOWNLOAD_FUNCTION,
      "rm -f /tmp/.seedrun-done",
    ];
    // Daytona used to bake its whole agent-CLI toolchain (claude, codex,
    // opencode, supabase, docker, ...) into the sandbox's Image
    // at build time — every fresh Daytona sandbox already had them.
    //
    // Vercel has NO equivalent custom Image: a fresh Vercel sandbox boots
    // bare `node24` with none of this installed. The ONLY place the CLIs get
    // installed for Vercel is right here, once, on the seed-prep sandbox —
    // they end up on disk only because this stage runs before the capture
    // below (triggerSeededSnapshot) bakes the whole filesystem into the
    // seeded `snap_*` snapshot. A session sandbox that boots from anything
    // OTHER than that seeded snapshot (i.e. bare node24, because no seed
    // build has completed yet) will NOT have Claude/Codex/etc. (the Cursor
    // SDK is installed via npm in the same global-install line).
    // — this is expected, not a bug; see getRepoSnapshotName.
    // Every install below must be idempotent: seed-prep often boots from a
    // warm base Image snap that already has the toolchain, and re-running
    // rpm/git-clone must skip (not fail) when the artifact is present.
    lines.push(
      'echo "SEEDRUN-STAGE:toolchain"',
      "sudo mkdir -p /home/eva/sandbox-config /home/eva/.eva-snapshot-state && sudo chmod -R 777 /home/eva",
      // gcc/make: agentation-mcp → better-sqlite3 node-gyp rebuild. A fresh
      // node24 sandbox has none of these; without them the global npm install
      // dies with `gyp ERR! not found: make`.
      'sudo dnf install -y docker git jq gzip tar procps-ng psmisc tigervnc-server python3 python3-pip xorg-x11-utils xterm dbus-x11 gcc gcc-c++ make || { echo "SEEDRUN-FAILED:toolchain-dnf"; exit 1; }',
      "sudo dnf install -y gtk3 nss alsa-lib libXtst at-spi2-core libdrm mesa-libgbm libxkbcommon libXdamage libXcomposite libXrandr libXcursor libXinerama cups-libs >/tmp/desktop-gui-dnf.log 2>&1 || true",
      // ffmpeg for agent-browser WebM recording, baked into the seeded
      // snapshot. Shared with the desktop-start repair so the two cannot drift.
      FFMPEG_INSTALL_SCRIPT,
      'docker info >/dev/null 2>&1 || sudo setsid dockerd </dev/null >/tmp/dockerd.log 2>&1 & for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done; sudo chmod 666 /var/run/docker.sock 2>/dev/null || true; docker info >/dev/null 2>&1 || { echo "SEEDRUN-FAILED:docker-start"; exit 1; }',
      'corepack enable || sudo corepack enable || { echo "SEEDRUN-FAILED:corepack"; exit 1; }',
      'corepack prepare pnpm@10.33.4 --activate || { echo "SEEDRUN-FAILED:pnpm"; exit 1; }',
      // Classic yarn for yarn.lock repos. Soft-fail: yarn installs are best-effort.
      "corepack prepare yarn@1.22.22 --activate || true",
      "git config --global --add safe.directory '*'",
      `command -v supabase >/dev/null 2>&1 || { github_release_download supabase/cli v${SUPABASE_CLI_VERSION} supabase_linux_amd64.tar.gz /tmp/sb.tgz && sudo tar -xzf /tmp/sb.tgz -C /usr/local/bin supabase; } || { echo "SEEDRUN-FAILED:supabase-cli"; exit 1; }`,
      // We install to /usr/local/bin, but repo seed scripts may invoke the CLI by
      // its absolute /usr/bin/supabase path (to avoid a node_modules/.bin shim).
      // Symlink so both paths resolve to the one binary.
      '[ -e /usr/bin/supabase ] || sudo ln -sf "$(command -v supabase)" /usr/bin/supabase || { echo "SEEDRUN-FAILED:supabase-cli-symlink"; exit 1; }',
      // GitHub CLI — Daytona Image installs via apt; Vercel AL2023 needs the
      // release tarball (dnf has no `gh` package by default). Tarball first
      // (pinned); official gh yum repo if GitHub Releases still flakes.
      `command -v gh >/dev/null 2>&1 || { github_release_download cli/cli v${GH_CLI_VERSION} gh_${GH_CLI_VERSION}_linux_amd64.tar.gz /tmp/gh.tgz && sudo tar -xzf /tmp/gh.tgz -C /tmp && sudo mv /tmp/gh_${GH_CLI_VERSION}_linux_amd64/bin/gh /usr/local/bin/gh && rm -rf /tmp/gh.tgz /tmp/gh_${GH_CLI_VERSION}_linux_amd64; } || { sudo dnf install -y 'dnf-command(config-manager)' && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo dnf install -y gh --repo gh-cli; } || { echo "SEEDRUN-FAILED:gh-cli"; exit 1; }`,
      // ripgrep and fd — every agent CLI reaches for these to search a repo, and
      // fall back to far slower `grep -r`/`find` when they are missing.
      `command -v rg >/dev/null 2>&1 || { github_release_download BurntSushi/ripgrep ${RIPGREP_VERSION} ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl.tar.gz /tmp/rg.tgz && sudo tar -xzf /tmp/rg.tgz -C /tmp && sudo mv /tmp/ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl/rg /usr/local/bin/rg && rm -rf /tmp/rg.tgz /tmp/ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl; } || { echo "SEEDRUN-FAILED:ripgrep"; exit 1; }`,
      `command -v fd >/dev/null 2>&1 || { github_release_download sharkdp/fd v${FD_VERSION} fd-v${FD_VERSION}-x86_64-unknown-linux-musl.tar.gz /tmp/fd.tgz && sudo tar -xzf /tmp/fd.tgz -C /tmp && sudo mv /tmp/fd-v${FD_VERSION}-x86_64-unknown-linux-musl/fd /usr/local/bin/fd && rm -rf /tmp/fd.tgz /tmp/fd-v${FD_VERSION}-x86_64-unknown-linux-musl; } || { echo "SEEDRUN-FAILED:fd"; exit 1; }`,
      // Git LFS. Without it a clone of an LFS repo succeeds but leaves pointer
      // stubs where the real files should be, which reads as corrupt content
      // rather than a missing tool. Registering the --system filters is the half
      // that makes checkout resolve pointers, so it must follow the binary; call
      // the absolute path because sudo's secure_path may exclude /usr/local/bin.
      `command -v git-lfs >/dev/null 2>&1 || { github_release_download git-lfs/git-lfs v${GIT_LFS_VERSION} git-lfs-linux-amd64-v${GIT_LFS_VERSION}.tar.gz /tmp/lfs.tgz && sudo tar -xzf /tmp/lfs.tgz -C /tmp && sudo mv /tmp/git-lfs-${GIT_LFS_VERSION}/git-lfs /usr/local/bin/git-lfs && rm -rf /tmp/lfs.tgz /tmp/git-lfs-${GIT_LFS_VERSION}; } || { echo "SEEDRUN-FAILED:git-lfs"; exit 1; }`,
      // The Image's primary git is a custom build under /opt/git, so its
      // "system" config resolves to /opt/git/etc/gitconfig — a directory the
      // image does not ship. `git lfs install --system` therefore failed with
      // "could not lock config file" and broke EVERY seeded build from the day
      // this step landed (the old >/dev/null redirect hid the message; keep
      // output visible in seedrun.log). Create the dir, register the filters
      // against the /opt/git git, then again against /etc/gitconfig so the
      // dnf-installed /usr/bin/git resolves LFS pointers too.
      "sudo mkdir -p /opt/git/etc",
      'sudo /usr/local/bin/git-lfs install --system || { echo "SEEDRUN-FAILED:git-lfs-filters"; exit 1; }',
      'sudo env GIT_CONFIG_SYSTEM=/etc/gitconfig /usr/local/bin/git-lfs install --system || { echo "SEEDRUN-FAILED:git-lfs-filters"; exit 1; }',
      `command -v claude >/dev/null 2>&1 && command -v codex >/dev/null 2>&1 && ${globalPackageIsVersion("@anthropic-ai/claude-code", CLAUDE_CODE_VERSION)} && ${globalPackageIsVersion("@anthropic-ai/claude-agent-sdk", CLAUDE_AGENT_SDK_VERSION)} && ${globalPackageIsVersion("@cursor/sdk", CURSOR_SDK_VERSION)} || sudo npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} @anthropic-ai/claude-agent-sdk@${CLAUDE_AGENT_SDK_VERSION} @openai/codex@0.146.0 agent-browser convex agentation-mcp@1.2.0 @cursor/sdk@${CURSOR_SDK_VERSION} || { echo "SEEDRUN-FAILED:agent-clis"; exit 1; }`,
      `command -v opencode >/dev/null 2>&1 && ${globalPackageIsVersion("@opencode-ai/sdk", OPENCODE_VERSION)} || sudo npm install -g opencode-ai@${OPENCODE_VERSION} @opencode-ai/sdk@${OPENCODE_VERSION} || { echo "SEEDRUN-FAILED:opencode-cli"; exit 1; }`,
      `command -v code-server >/dev/null 2>&1 || { github_release_download coder/code-server v${CODE_SERVER_VERSION} code-server-${CODE_SERVER_VERSION}-amd64.rpm /tmp/code-server.rpm && sudo rpm -Uvh /tmp/code-server.rpm && rm -f /tmp/code-server.rpm; } || { echo "SEEDRUN-FAILED:code-server"; exit 1; }`,
      'command -v websockify >/dev/null 2>&1 || python3 -m pip install --user --break-system-packages websockify >/tmp/websockify-pip.log 2>&1 || python3 -m pip install --user websockify >/tmp/websockify-pip.log 2>&1 || { echo "SEEDRUN-FAILED:websockify"; exit 1; }',
      "sudo ln -sf $(python3 -m site --user-base)/bin/websockify /usr/local/bin/websockify 2>/dev/null || true",
      // Canonical path matches vercel-sandbox-gui + VercelDesktop (/opt/novnc).
      '[ -d /opt/novnc ] || { sudo rm -rf /opt/noVNC; sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc; } || { echo "SEEDRUN-FAILED:novnc"; exit 1; }',
      "sudo tee /etc/yum.repos.d/google-chrome.repo >/dev/null <<'EOF'\n[google-chrome]\nname=google-chrome\nbaseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64\nenabled=1\ngpgcheck=1\ngpgkey=https://dl.google.com/linux/linux_signing_key.pub\nEOF",
      'command -v google-chrome-stable >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1 || sudo dnf install -y google-chrome-stable >/tmp/chrome-dnf.log 2>&1 || sudo dnf install -y chromium >/tmp/chromium-dnf.log 2>&1 || { echo "SEEDRUN-FAILED:chrome"; exit 1; }',
      "mkdir -p /home/eva/.claude/plugins/marketplaces",
      '[ -d /home/eva/.claude/plugins/marketplaces/claude-plugins-official/.git ] || git clone --depth 1 https://github.com/anthropics/claude-plugins-official.git /home/eva/.claude/plugins/marketplaces/claude-plugins-official || { echo "SEEDRUN-FAILED:claude-plugins"; exit 1; }',
      '[ -d /home/eva/.claude/plugins/marketplaces/Dammyjay93/.git ] || git clone --depth 1 https://github.com/Dammyjay93/interface-design.git /home/eva/.claude/plugins/marketplaces/Dammyjay93 || { echo "SEEDRUN-FAILED:interface-design-plugin"; exit 1; }',
      '[ -d /home/eva/.claude/plugins/marketplaces/maister-plugins/.git ] || git clone --depth 1 https://github.com/SkillPanel/maister.git /home/eva/.claude/plugins/marketplaces/maister-plugins || { echo "SEEDRUN-FAILED:maister-plugin"; exit 1; }',
      `echo '{"enabledPlugins":{"frontend-design@claude-plugins-official":true,"superpowers@claude-plugins-official":true,"context7@claude-plugins-official":true,"interface-design@Dammyjay93":true,"maister@maister-plugins":true}}' > /home/eva/.claude/settings.json`,
      'echo "SEEDRUN-STAGE:path-setup"',
      "echo 'export PATH=\"/home/eva/.local/bin:/usr/local/bin:$PATH\"' | sudo tee /etc/profile.d/eva-path.sh >/dev/null && sudo chmod 644 /etc/profile.d/eva-path.sh",
      'grep -qF "/home/eva/.local/bin" /home/eva/.bashrc 2>/dev/null || echo \'export PATH="/home/eva/.local/bin:/usr/local/bin:$PATH"\' >> /home/eva/.bashrc',
      'grep -qF "/home/eva/.local/bin" /vercel/sandbox/.eva-env.sh 2>/dev/null || echo \'export PATH="/home/eva/.local/bin:/usr/local/bin:$PATH"\' >> /vercel/sandbox/.eva-env.sh',
    );

    // Config files (data.sql, backup zips) are NOT baked into a fresh Vercel
    // sandbox the way they are into the Daytona Image — download them here so
    // the update stage below can copy them into /tmp/repo before install.
    const configFiles: SandboxConfigFile[] = await ctx.runQuery(
      internal.sandboxConfigFiles.getConfigFilesForSnapshot,
      { repoId: args.repoId },
    );
    const downloadableFiles = filterDownloadableConfigFiles(configFiles);
    if (downloadableFiles.length > 0) {
      lines.push('echo "SEEDRUN-STAGE:config-files"');
      downloadableFiles.forEach((file, i) => {
        const commands = buildConfigFileDownloadCommands(
          file,
          "/home/eva/sandbox-config",
        );
        commands.forEach((command) => {
          lines.push(
            `( ${command} ) || { echo "SEEDRUN-FAILED:config-${i}"; exit 1; }`,
          );
        });
      });
    }
    // Swap before install/build/daemons: the seed run is the single most
    // memory-hungry stretch a sandbox ever sees (dep install, then a full
    // Convex import validated against every restored doc). Same script as the
    // per-boot provisioning so there is one source of truth; base64 keeps its
    // quoting intact inside this generated script.
    lines.push(
      'echo "SEEDRUN-STAGE:swap"',
      `echo ${Buffer.from(buildEnsureSwapScript(resolveSwapConfig()), "utf8").toString("base64")} | base64 -d > /tmp/eva-ensure-swap.sh && bash /tmp/eva-ensure-swap.sh || true`,
    );
    // ---- update: latest code + fresh deps/artifacts ----
    lines.push(
      'echo "SEEDRUN-STAGE:update"',
      'cd /tmp/repo || { echo "SEEDRUN-FAILED:no-repo"; exit 1; }',
      `( git checkout -f ${args.branch} 2>/dev/null || git checkout -fb ${args.branch} origin/${args.branch} ) && git reset --hard origin/${args.branch} || { echo "SEEDRUN-FAILED:git-reset"; exit 1; }`,
    );
    lines.push(
      // Mirror config files into the repo tree (staged outside the repo so
      // they survive git clean).
      "cp -a /home/eva/sandbox-config/. /tmp/repo/ 2>/dev/null || true",
      'echo "SEEDRUN-STAGE:install"',
      // Node: lockfile at repo root picks the manager. pnpm stays fatal (existing
      // repos); yarn/npm warn and continue so polyglot / legacy roots can still
      // finish the seed. Markers must never contain the substring SEEDRUN-FAILED.
      // pnpm output is tee'd to /tmp/seed-install.log so fetchSeedDiagnostics
      // can surface it: pnpm 10+ skips unapproved dependency build scripts with
      // only a warning and exit 0, which leaves e.g. the `supabase` CLI binary
      // missing and only fails much later, in a background command.
      'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile 2>&1 | tee /tmp/seed-install.log; [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "SEEDRUN-FAILED:install"; exit 1; }; grep -q "Ignored build scripts" /tmp/seed-install.log && echo "SEEDRUN-WARN:ignored-build-scripts"; elif [ -f yarn.lock ]; then yarn install || echo "SEEDRUN-WARN:install-yarn"; elif [ -f package-lock.json ]; then npm ci || npm install || echo "SEEDRUN-WARN:install-npm"; elif [ -f package.json ]; then npm install || echo "SEEDRUN-WARN:install-npm"; else echo "SEEDRUN: skip node install (no package manifest)"; fi',
      // Python: independent of Node. Lazy-install compile deps only when a
      // Python manifest exists (libpq-devel for psycopg2 source builds).
      "if [ -f requirements.txt ] || [ -f pyproject.toml ]; then sudo dnf install -y gcc gcc-c++ make python3-devel libpq-devel >/tmp/py-build-deps-dnf.log 2>&1 || true; fi",
      'if [ -f requirements.txt ]; then python3 -m pip install --user --break-system-packages -r requirements.txt >/tmp/pip-install.log 2>&1 || python3 -m pip install --user -r requirements.txt >>/tmp/pip-install.log 2>&1 || { tail -50 /tmp/pip-install.log; echo "SEEDRUN-WARN:install-pip"; }; elif [ -f pyproject.toml ]; then python3 -m pip install --user --break-system-packages -e . >/tmp/pip-install.log 2>&1 || python3 -m pip install --user -e . >>/tmp/pip-install.log 2>&1 || { tail -50 /tmp/pip-install.log; echo "SEEDRUN-WARN:install-pip"; }; fi',
    );
    // Vercel node24 base has no container runtime. Install Docker if missing,
    // then ensure the daemon is running and the socket is group-accessible so
    // startup/background commands can run `docker ps` without sudo. Kept as a
    // defensive re-check even though the toolchain stage above already starts
    // dockerd — idempotent, so harmless when it is already running.
    lines.push(
      'echo "SEEDRUN-STAGE:docker-bootstrap"',
      // Install Docker if not already present (skip on warm snapshots that
      // already have it baked in).
      'command -v docker >/dev/null 2>&1 || { sudo dnf install -y docker 2>&1 || { echo "SEEDRUN-FAILED:docker-install"; exit 1; }; }',
      // Ensure daemon is running (Vercel does not auto-start dockerd on restore).
      'sudo docker info >/dev/null 2>&1 || sudo systemctl start docker 2>&1 || { echo "SEEDRUN-FAILED:docker-start"; exit 1; }',
      // Open the socket so non-root `docker` commands work (background/startup
      // commands run as the sandbox user without sudo).
      "sudo chmod 666 /var/run/docker.sock 2>/dev/null || true",
      // Block until the daemon is fully ready.
      "until docker info >/dev/null 2>&1; do sleep 1; done",
    );
    args.buildCommands.forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:build-${i}"; exit 1; }`,
      );
    });
    // Split startup around daemons: pure sandbox-config file moves run before
    // daemons so the files are in place when `convex dev` boots; everything
    // else (env set, imports, readiness waits) runs after the daemons start.
    const startup = startupCommands ?? [];
    const preDaemonStartup: string[] = [];
    const postDaemonStartup: string[] = [];
    for (const command of startup) {
      if (startupCommandNeedsDaemon(command)) {
        postDaemonStartup.push(command);
      } else {
        preDaemonStartup.push(command);
      }
    }
    lines.push('echo "SEEDRUN-STAGE:startup-pre-daemon"');
    preDaemonStartup.forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:startup-pre-${i}"; exit 1; }`,
      );
    });
    // ---- daemons: launch each background command detached (b64 per command
    // so quoting inside user commands can never break the script) ----
    lines.push('echo "SEEDRUN-STAGE:daemons"');
    (backgroundCommands ?? []).forEach((command, i) => {
      // Convex daemons need the same plant/agent-mode wrapper as
      // runBackgroundCommands (anonymous CLI rejects --local-backend-version).
      const scriptBody = isConvexBackendCommand(command)
        ? buildConvexBackgroundScriptBody(command)
        : command;
      const cb64 = Buffer.from(scriptBody, "utf8").toString("base64");
      lines.push(
        `echo ${cb64} | base64 -d > /tmp/bg-cmd-${i}.sh && chmod +x /tmp/bg-cmd-${i}.sh && setsid nohup bash -l /tmp/bg-cmd-${i}.sh </dev/null > /tmp/bg-${i}.log 2>&1 & echo $! > /tmp/bg-${i}.pid`,
      );
    });
    // Native Convex readiness gate: seed commands (`npx convex env set`,
    // `npx convex import`) need a *running backend* — not a completed push.
    // Gating on the functions-ready line deadlocks every repo whose
    // auth.config.ts reads a deployment env var: the daemon's first push fails
    // for the missing value, and the seed commands that would set it run after
    // this gate. So the fatal wait is on the backend health endpoint, and the
    // push happens after the seed commands instead (convex-push stage below).
    // Detached script — a plain bash
    // wait has no exec ceiling here. 900s covers cold binary plants; a daemon
    // that exits early ends the wait instead of burning the full window.
    (backgroundCommands ?? []).forEach((command, i) => {
      if (!isConvexBackendCommand(command)) return;
      const backendUp = `{ curl -sf -m 3 ${CONVEX_LOCAL_BACKEND_HEALTH_URL} >/dev/null 2>&1 || grep -q "${CONVEX_FUNCTIONS_READY_LOG_LINE}" /tmp/bg-${i}.log 2>/dev/null; }`;
      lines.push(
        `echo "SEEDRUN-STAGE:convex-ready-${i}"`,
        `for s in $(seq 1 180); do`,
        `  ${backendUp} && break`,
        `  if [ -f /tmp/bg-${i}.pid ] && ! kill -0 "$(cat /tmp/bg-${i}.pid)" 2>/dev/null; then echo "convex-ready-${i}: daemon exited"; break; fi`,
        "  sleep 5",
        "done",
        `${backendUp} || { echo "SEEDRUN-FAILED:convex-ready-${i}"; tail -n 60 /tmp/bg-${i}.log 2>/dev/null; exit 1; }`,
        `grep -q "${CONVEX_FUNCTIONS_READY_LOG_LINE}" /tmp/bg-${i}.log 2>/dev/null || echo "convex-ready-${i}: backend up, functions not pushed yet — seed commands run next"`,
      );
    });
    // ---- seed (post-daemon) ----
    lines.push('echo "SEEDRUN-STAGE:startup-post-daemon"');
    postDaemonStartup.forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:startup-post-${i}"; exit 1; }`,
      );
    });
    // Seed-once commands run last, after the per-boot startup commands (whose
    // readiness gates guarantee services are actually up for env set / import).
    lines.push('echo "SEEDRUN-STAGE:seed-commands"');
    args.seedCommands.forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:seed-${i}"; exit 1; }`,
      );
    });
    // Functions land on the local backend only now, once the seeds have set the
    // env vars its auth config needs — see buildConvexPostSeedPushLines.
    if ((backgroundCommands ?? []).some(isConvexBackendCommand)) {
      lines.push(...buildConvexPostSeedPushLines("/tmp/repo"));
    }
    lines.push(...seededRuntimeStateCaptureLines(requireSupabaseDump));
    // Marker so a sandbox booting from the captured snapshot skips the seed.
    lines.push("touch /tmp/.startup-commands-done");
    (stopCommands ?? []).forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:stop-${i}"; exit 1; }`,
      );
    });
    lines.push('echo "SEEDRUN-DONE"', "touch /tmp/.seedrun-done");
    const script = lines.join("\n");
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    // Process-based guard makes the launch idempotent so the workflow can
    // retry a timed-out launch exec without racing a second copy. It must be
    // the LIVE process (pgrep, self-match-proof bracket pattern), not a
    // lockfile: a prep sandbox warm-booted from a previously captured seeded
    // snapshot carries that capture's marker files baked into /tmp, and a
    // file-based guard would skip the launch and instantly report the baked
    // "done" — capturing without ever re-seeding. Stale markers are scrubbed
    // before every fresh launch for the same reason.
    const alreadyRunning = await execHandle(
      sandbox,
      'pgrep -f "[s]eedrun.sh" >/dev/null && echo ALREADY-RUNNING || echo NOT-RUNNING',
      30,
    );
    if (!alreadyRunning.includes("ALREADY-RUNNING")) {
      // Never inline the script as base64 in a shell command — carepulse's
      // startup/background arrays make the payload far larger than ARG_MAX.
      // Use the provider writeFile API instead.
      await execHandle(
        sandbox,
        "rm -f /tmp/.seedrun-done /tmp/seedrun.log /tmp/seedrun.sh",
        30,
      );
      await sandbox.writeFile("/tmp/seedrun.sh", script);
      await execHandle(sandbox, "chmod +x /tmp/seedrun.sh", 30);
      const wrote = await execHandle(
        sandbox,
        "test -s /tmp/seedrun.sh && echo WROTE || echo WRITE-FAILED",
        30,
      );
      if (!wrote.includes("WROTE")) {
        throw new Error("Failed to write /tmp/seedrun.sh to the prep sandbox");
      }
      await sandbox.execDetached("/tmp/seedrun.sh");
    }
    return null;
  },
});

/**
 * Seeded-snapshot build — DIAGNOSTICS step. Returns the tail of the seed-run
 * log and background daemon logs so a failed seed can be appended to the build
 * record BEFORE the prep sandbox is torn down (teardown destroys the evidence).
 */
export const fetchSeedDiagnostics = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    try {
      return await execHandle(
        sandbox,
        [
          'echo "== git state =="',
          "( cd /tmp/repo && git rev-parse --short HEAD 2>&1; git status -s 2>&1 | head -5 )",
          'echo "== convex versions =="',
          "( cd /tmp/repo && npx convex --version 2>&1; ls -la ~/.convex/ 2>&1 | head; ls -la ~/.cache/convex/ 2>&1 | head )",
          // Which package manager actually ran, and why: Corepack resolves the
          // repo pin, else its Last Known Good, else (DEFAULT_TO_LATEST) npm
          // `latest`. The pnpm 12 incident was invisible without these lines.
          'echo "== toolchain =="',
          "( cd /tmp/repo && node --version 2>&1; corepack --version 2>&1; echo \"pnpm $(pnpm --version 2>&1 | tail -n 1)\"; grep -o '\"packageManager\": *\"[^\"]*\"' package.json 2>/dev/null || echo 'packageManager: (none)'; echo lastKnownGood: $(cat ~/.cache/node/corepack/lastKnownGood.json 2>/dev/null | tr -d ' \\n') )",
          // Install warnings pnpm prints and then forgets (ignored build
          // scripts, peer/engine warnings). Written by the install stage.
          'echo "== install log (warnings) =="',
          "grep -aE 'Ignored build|ERR_PNPM|WARN|Done in .* using pnpm' /tmp/seed-install.log 2>/dev/null | tail -n 20",
          // Fixed 32 GB disk; seeds that import large file storage hit ENOSPC
          // mid-import and then only time out. Show the headroom at failure.
          'echo "== disk =="',
          "df -h / 2>&1; du -xsh /swapfile /tmp/repo/node_modules ~/.local/share/pnpm ~/.cache ~/.convex 2>/dev/null || true",
          'echo "== 3210 listening? =="',
          "curl -s -o /dev/null -w 'backend http:%{http_code}\\n' http://127.0.0.1:3210 2>&1 || echo '3210 unreachable'",
          'echo "== seedrun.log (tail) =="; tail -c 4000 /tmp/seedrun.log 2>/dev/null',
          'for f in /tmp/bg-*.log; do echo; echo "== $f =="; tail -c 3000 "$f" 2>/dev/null; done',
          "true",
        ].join("; "),
        90,
      );
    } catch (e) {
      return `diagnostics unavailable: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

/**
 * Seeded-snapshot build — SEED POLL step. `state` is "done" when the detached
 * seed script finished cleanly, "failed:<stage>" when it aborted (stage names
 * the command index, e.g. startup-3), and "running" otherwise. `stage` is the
 * latest SEEDRUN-STAGE marker so the workflow can stream progress into the
 * build record. Only the stage marker is surfaced, never raw log lines: the
 * log is written under `set -x` and the seed commands carry live deploy keys.
 */
export const pollSeedRun = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.object({
    state: v.string(),
    stage: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ state: string; stage: string | null }> => {
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const out = await execHandle(
      sandbox,
      [
        "test -f /tmp/.seedrun-done && echo DONE",
        'grep -aoE "SEEDRUN-FAILED:[a-z0-9-]+" /tmp/seedrun.log 2>/dev/null | tail -1',
        'echo "STAGE=$(grep -aoE "SEEDRUN-STAGE:[a-z0-9-]+" /tmp/seedrun.log 2>/dev/null | tail -1)"',
        "test -f /tmp/seedrun.sh || echo NO-SCRIPT",
        'pgrep -f "[s]eedrun.sh" >/dev/null || echo NO-PROC',
        "true",
      ].join("; "),
      30,
    );
    const stageMatch = out.match(/STAGE=SEEDRUN-STAGE:([a-z0-9-]+)/);
    const stage = stageMatch ? stageMatch[1] : null;
    if (out.includes("DONE")) return { state: "done", stage };
    const failed = out.match(/SEEDRUN-FAILED:([a-z0-9-]+)/);
    if (failed) return { state: `failed:${failed[1]}`, stage };
    if (out.includes("NO-SCRIPT")) return { state: "failed:no-script", stage };
    // Script file exists but process died without writing done/failed markers.
    if (out.includes("NO-PROC") && !out.includes("DONE")) {
      const hasLog = await execHandle(
        sandbox,
        "test -s /tmp/seedrun.log && echo HAS-LOG || echo NO-LOG",
        15,
      );
      if (hasLog.includes("NO-LOG")) {
        return { state: "failed:exited-no-log", stage };
      }
    }
    return { state: "running", stage };
  },
});

/**
 * Seeded-snapshot build step: creates + prepares a sandbox from the base Image
 * snapshot (NOT a seeded one — passed explicitly to bypass the seeded preference
 * in getRepoSnapshotName), ready to run the app's background/seed/stop commands.
 */
export const createSeedPrepSandbox = internalAction({
  args: { repoId: v.id("githubRepos"), imageSnapshot: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), sandboxId: v.string() }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; sandboxId: string } | { ok: false; error: string }
  > => {
    const resolved = await tryResolveSandboxCredentials(ctx, args.repoId);
    if (!resolved.ok) {
      console.warn(`[snapshot] createSeedPrepSandbox: ${resolved.error}`);
      return { ok: false, error: resolved.error };
    }
    const { credentials, sandboxEnvVars } = resolved;
    const client = getSandboxClient(credentials);
    // Vercel snapshot IDs are `snap_*`. If a non-`snap_*` name is passed (e.g.
    // a stale/legacy value), fall back to a fresh sandbox (no snapshot source)
    // so the first build can bootstrap the chain by cloning the repo from scratch.
    const effectiveImageSnapshot = !args.imageSnapshot.startsWith("snap_")
      ? undefined
      : args.imageSnapshot;
    const repo = await ctx.runQuery(internal.repoSnapshots.getRepo, {
      repoId: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");
    const seedPrepLifecycle = {
      ...SESSION_LIFECYCLE,
      labels: {
        [SEED_PREP_LABEL_KEY]: SEED_PREP_LABEL_VALUE,
        [SANDBOX_TAG.repoId]: args.repoId,
      },
    };
    const { sandbox } = await createSandboxAndPrepareRepo(
      ctx,
      client,
      repo.installationId,
      repo.owner,
      repo.name,
      { ...sandboxEnvVars, REPO_ID: args.repoId },
      seedPrepLifecycle,
      effectiveImageSnapshot,
      undefined, // onSandboxAcquired
      undefined, // onProgress
      { mode: "all" }, // syncStrategy
      // Large seeded snapshots take well over the 30s default to boot; 180s
      // avoids the spurious create timeout + orphaned sandbox on warm boots.
      180,
      // Skip pnpm/yarn install: launchSeedRun's buildCommands install deps
      // inside the detached seed script. Installing here would blow Convex's
      // 600s per-action ceiling on providers (Vercel) that don't have deps
      // pre-baked into their base snapshot.
      true,
    );
    return { ok: true, sandboxId: sandbox.id };
  },
});

/**
 * Deletes a seed-prep sandbox. Used by the snapshot build workflow after the
 * seed run completes (success or failure) so the sandbox does not linger.
 */
export const deleteSeedPrepSandbox = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    sandboxId: v.string(),
    /** Keep this snap_* when tearing down the prep sandbox (successful seed). */
    preserveSnapshotId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
    const client = getSandboxClient(credentials);
    try {
      const handle = await client.get(args.sandboxId);
      await handle.delete({
        preserveSnapshotIds:
          args.preserveSnapshotId !== undefined
            ? [args.preserveSnapshotId]
            : undefined,
      });
    } catch (e) {
      // Best-effort: log but do not fail the build if delete fails.
      console.error(
        `[snapshot] deleteSeedPrepSandbox: failed to delete ${args.sandboxId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return null;
  },
});

/**
 * Seeded-snapshot build — TRIGGER step. Registers a snapshot of the
 * (clean-stopped) sandbox's filesystem, including the seeded Docker volumes.
 *
 * Non-blocking: the underlying POST returns as soon as the snapshot is
 * registered, while the capture itself keeps running server-side for minutes — a
 * seeded snapshot carries the whole DB volume. That is what makes the
 * trigger-then-poll split work: completion is observed by
 * pollSeededSnapshotState across separate workflow steps, so no single action
 * awaits the capture and risks Convex's hard 600s limit.
 *
 * Errors propagate to the per-app fallback (base Image + fresh clone).
 */
export const triggerSeededSnapshot = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    sandboxId: v.string(),
    seededName: v.string(),
  },
  // Returns the effective snapshot identifier used by the provider. On the
  // now-removed Daytona provider this equaled seededName (name IS the id); on
  // Vercel it is the `snap_*` id returned by the API. The workflow must use
  // this value — not seededName — when polling and writing seededSnapshotName
  // to the DB.
  returns: v.object({ snapshotId: v.string() }),
  handler: async (ctx, args): Promise<{ snapshotId: string }> => {
    const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
    const client = getSandboxClient(credentials);
    const handle = await client.get(args.sandboxId);
    // The seeded snapshot is the base image for every sandbox of this repo —
    // never bake the swapfile into it. Each boot recreates swap in seconds.
    await releaseSwapFile(handle);
    const { snapshotId } = await handle.createSnapshot({
      name: args.seededName,
    });
    return { snapshotId };
  },
});

/**
 * Seeded-snapshot build — POLL step. Returns the snapshot entity's current state
 * ("active" on success, "error"/"build_failed" on failure, otherwise still
 * building; "pending" if it is not registered yet).
 *
 * We poll the SNAPSHOT entity, not the sandbox state: a sandbox snapshot can
 * reach "active" while the source sandbox still reports "snapshotting", so a
 * sandbox-state poll can wait out the whole window and wrongly record a fallback
 * for a snapshot that actually succeeded. The snapshot's own state is the
 * authoritative signal — the same one the base-Image build polls.
 */
export const pollSeededSnapshotState = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    seededName: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
    const client = getSandboxClient(credentials);
    // Not registered yet (or a transient lookup miss) → treat as still pending.
    const snapshot = await client.getSnapshot(args.seededName);
    if (!snapshot) return "pending";
    // SandboxSnapshotInfo.status uses "ready" for success; the workflow polls
    // for "active" (the Daytona-era term). Map "ready" → "active" so the
    // existing isTerminalSnapshotState / state === "active" checks still work.
    return snapshot.status === "ready" ? "active" : snapshot.status;
  },
});

/**
 * Best-effort safety net run at the end of every whole-repo seeded-snapshot
 * build (success or failure): deletes any seed-prep sandbox left behind for
 * the given repos. The workflow already deletes the prep sandbox it created
 * explicitly on every path, so this only catches leaks (e.g. a crash between
 * creating a sandbox and deleting it). Never throws — a failure here must not
 * fail the build.
 */
export const stopAllRepoSandboxes = internalAction({
  args: { seedableRepoIds: v.array(v.id("githubRepos")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (args.seedableRepoIds.length === 0) return null;
    const primaryRepoId = args.seedableRepoIds[0];
    try {
      const { credentials } = await resolveSandboxCredentials(
        ctx,
        primaryRepoId,
      );
      // Delete every seed-prep sandbox tagged for these repos so none
      // keep running/billing. Filtered STRICTLY by the seed-prep purpose tag +
      // repoId — session/task sandboxes use eva.purpose=persistent|ephemeral
      // and are never matched. This is a safety net; the workflow already
      // deletes the build's own prep sandbox explicitly on every exit path.
      // It also reclaims orphans left by a crashed build.
      const seedableSet = new Set<string>(args.seedableRepoIds);
      const list = await Sandbox.list({
        token: credentials.token,
        teamId: credentials.teamId,
        projectId: credentials.projectId,
      });
      // list() yields plain metadata (no .delete()); re-hydrate matches through
      // the provider client to stop+remove them.
      const client = getSandboxClient(credentials);
      let deleted = 0;
      for await (const meta of list) {
        const tags: Record<string, string> = meta.tags ?? {};
        if (tags[SEED_PREP_LABEL_KEY] !== SEED_PREP_LABEL_VALUE) continue;
        const sandboxRepoId = tags[SANDBOX_TAG.repoId];
        if (sandboxRepoId === undefined || !seedableSet.has(sandboxRepoId)) {
          continue;
        }
        try {
          const handle = await client.get(meta.name);
          await handle.delete();
          deleted++;
        } catch (err) {
          console.warn(
            `[snapshot] stopAllRepoSandboxes: failed to delete ${meta.name}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      console.log(
        `[snapshot] stopAllRepoSandboxes: deleted ${deleted} vercel seed-prep sandbox(es)`,
      );
    } catch (e) {
      console.error(
        `[snapshot] stopAllRepoSandboxes: best-effort sweep failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return null;
  },
});

/**
 * Deletes a seeded snapshot by its id/name so previous `snap_*` captures don't
 * accumulate — the single-snapshot build makes a fresh capture each run.
 * Best-effort: a missing snapshot, or a legacy `seeded-*` name left over from
 * the now-removed Daytona provider, just no-ops (deleteSnapshot returns false).
 */
export const deleteSeededSnapshot = internalAction({
  args: { snapshotName: v.string(), repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
      const client = getSandboxClient(credentials);
      const deleted = await client.deleteSnapshot(args.snapshotName);
      // Explicit confirmation so "keep-last" / rebuild deletion can be
      // verified in Convex logs, not just the build's UI log stream.
      console.log(
        deleted
          ? `[snapshot] deleteSeededSnapshot: deleted ${args.snapshotName}`
          : `[snapshot] deleteSeededSnapshot: ${args.snapshotName} not found (already gone)`,
      );
    } catch (e) {
      console.error(
        `[snapshot] deleteSeededSnapshot: failed to delete ${args.snapshotName}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return null;
  },
});

/**
 * One-shot / ops cleanup: delete every Vercel snap_* in the project that is not
 * (1) a seeded / base Image capture, or (2) the currentSnapshotId of a sandbox
 * Eva still references. Ghost sandboxes that only exist in Sandbox.list are
 * not protected — their snaps are orphans.
 *
 *   npx convex run snapshotActions:purgeUnreferencedVercelSnapshots --prod '{"repoId":"…"}'
 */
export const purgeUnreferencedVercelSnapshots = internalAction({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({
    protectedCount: v.number(),
    liveSandboxCount: v.number(),
    evaSandboxCount: v.number(),
    deletedCount: v.number(),
    skippedCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    protectedCount: number;
    liveSandboxCount: number;
    evaSandboxCount: number;
    deletedCount: number;
    skippedCount: number;
  }> => {
    const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
    const creds = {
      token: credentials.token,
      teamId: credentials.teamId,
      projectId: credentials.projectId,
    };
    const protectedIds = new Set(
      await ctx.runQuery(
        internal.repoSnapshots.listAllProtectedSnapshotIds,
        {},
      ),
    );
    const knownSandboxIds = new Set(
      await ctx.runQuery(internal.repoSnapshots.listReferencedSandboxIds, {}),
    );

    // Only protect resume snaps for sandboxes Eva still points at. Vercel
    // Sandbox.list also returns ghosts / stopped leftovers whose current snap
    // would otherwise stay protected forever.
    let liveSandboxCount = 0;
    let evaSandboxCount = 0;
    const sandboxes = await Sandbox.list(creds);
    for await (const sandbox of sandboxes) {
      liveSandboxCount += 1;
      if (!knownSandboxIds.has(sandbox.name)) continue;
      evaSandboxCount += 1;
      const currentId = sandbox.currentSnapshotId;
      if (typeof currentId === "string" && currentId.length > 0) {
        protectedIds.add(currentId);
      }
    }

    const listed = await Snapshot.list(creds);
    let deletedCount = 0;
    let skippedCount = 0;
    // list() yields plain metadata (`id`, no .delete()) — re-hydrate to delete.
    for await (const meta of listed) {
      if (protectedIds.has(meta.id)) {
        skippedCount += 1;
        continue;
      }
      if (String(meta.status) !== "created") {
        skippedCount += 1;
        continue;
      }
      try {
        const snap = await Snapshot.get({
          ...creds,
          snapshotId: meta.id,
        });
        if (String(snap.status) !== "created") {
          skippedCount += 1;
          continue;
        }
        await snap.delete();
        deletedCount += 1;
      } catch (error) {
        console.warn(
          `[snapshot] purgeUnreferencedVercelSnapshots: failed ${meta.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    console.log(
      `[snapshot] purgeUnreferencedVercelSnapshots: protected=${protectedIds.size} liveSandboxes=${liveSandboxCount} evaSandboxes=${evaSandboxCount} deleted=${deletedCount} skipped=${skippedCount}`,
    );
    return {
      protectedCount: protectedIds.size,
      liveSandboxCount,
      evaSandboxCount,
      deletedCount,
      skippedCount,
    };
  },
});

/**
 * Run {@link purgeUnreferencedVercelSnapshots} once per unique Vercel project
 * (deduped across githubRepos that share credentials).
 *
 *   npx convex run snapshotActions:purgeUnreferencedVercelSnapshotsAll --prod
 */
export const purgeUnreferencedVercelSnapshotsAll = internalAction({
  args: {
    repoIndex: v.optional(v.number()),
    deleted: v.optional(v.number()),
    protected: v.optional(v.number()),
    skipped: v.optional(v.number()),
    projects: v.optional(v.number()),
    projectsSeen: v.optional(v.array(v.string())),
  },
  returns: v.object({
    deleted: v.number(),
    protected: v.number(),
    skipped: v.number(),
    projects: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    let deleted = args.deleted ?? 0;
    let protectedCount = args.protected ?? 0;
    let skipped = args.skipped ?? 0;
    let projects = args.projects ?? 0;
    const projectsSeen = new Set(args.projectsSeen ?? []);

    const repoIds = await ctx.runQuery(
      internal.sandboxCleanup.listGithubRepoIds,
      {},
    );
    const repoIndex = args.repoIndex ?? 0;

    if (repoIndex >= repoIds.length) {
      console.log(
        `[purgeUnreferencedVercelSnapshotsAll] done deleted=${deleted} protected=${protectedCount} skipped=${skipped} projects=${projects}`,
      );
      return {
        deleted,
        protected: protectedCount,
        skipped,
        projects,
        done: true,
      };
    }

    const repoId = repoIds[repoIndex];
    if (repoId === undefined) {
      return {
        deleted,
        protected: protectedCount,
        skipped,
        projects,
        done: true,
      };
    }

    try {
      const { credentials } = await resolveSandboxCredentials(ctx, repoId);
      const projectKey = `${credentials.teamId}:${credentials.projectId}`;
      if (!projectsSeen.has(projectKey)) {
        projectsSeen.add(projectKey);
        const result = await ctx.runAction(
          internal.snapshotActions.purgeUnreferencedVercelSnapshots,
          { repoId },
        );
        deleted += result.deletedCount;
        protectedCount += result.protectedCount;
        skipped += result.skippedCount;
        projects += 1;
      }
    } catch (err) {
      console.warn(
        `[purgeUnreferencedVercelSnapshotsAll] skip repo=${repoId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const nextIndex = repoIndex + 1;
    if (nextIndex < repoIds.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.snapshotActions.purgeUnreferencedVercelSnapshotsAll,
        {
          repoIndex: nextIndex,
          deleted,
          protected: protectedCount,
          skipped,
          projects,
          projectsSeen: [...projectsSeen],
        },
      );
      return {
        deleted,
        protected: protectedCount,
        skipped,
        projects,
        done: false,
      };
    }

    console.log(
      `[purgeUnreferencedVercelSnapshotsAll] done deleted=${deleted} protected=${protectedCount} skipped=${skipped} projects=${projects}`,
    );
    return {
      deleted,
      protected: protectedCount,
      skipped,
      projects,
      done: true,
    };
  },
});
