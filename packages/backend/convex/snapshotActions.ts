"use node";

import type { SnapshotState } from "./_sandbox_runtime/snapshotStates";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { quote } from "shell-quote";
import {
  resolveSandboxCredentials,
  resolveSeedOnlyEnvVars,
  tryResolveSandboxCredentials,
} from "./envVarResolver";
import { execHandle, getSandboxHandle } from "./_sandbox_runtime/helpers";
import {
  createSandboxAndPrepareRepo,
  SESSION_LIFECYCLE,
} from "./_sandbox_runtime/git";
import { getSandboxClient } from "./_sandbox/factory";
import { computeStartupFingerprint } from "./_evaConfig/config";
import { STARTUP_MARKER_PATH } from "./_sandbox_runtime/startupMarker";
import { FFMPEG_INSTALL_SCRIPT } from "./_sandbox/ffmpegInstall";
import { DRIVE_CACHE_ENV, DRIVE_CACHE_WRITER } from "./_sandbox/driveCache";
import { buildSeedRunDockerStartCommand } from "./_sandbox_runtime/dockerBootstrap";
import { writeSandboxFile } from "./_sandbox_runtime/sandboxFiles";
import {
  COREPACK_SANDBOX_ENV,
  renderEvaEnvFile,
} from "./_sandbox/vercelEnvFile";
import {
  buildConvexBackendWatchdogLines,
  buildConvexBackgroundScriptBody,
  buildConvexPostSeedPushLines,
  isConvexBackendCommand,
  STOP_CONVEX_BACKEND_WATCHDOG_LINE,
  CONVEX_FUNCTIONS_READY_ATTEMPTS,
  CONVEX_FUNCTIONS_READY_LOG_LINE,
  CONVEX_LOCAL_BACKEND_HEALTH_URL,
} from "./_sandbox_runtime/convexLocalBackend";
import {
  buildEnsureSwapScript,
  releaseSwapFile,
  resolveSwapConfig,
} from "./_sandbox_runtime/swap";
import {
  resolveClaudeCliVersion,
  resolveCodexCliVersion,
} from "./_sandbox_runtime/launch";
import { Sandbox, Snapshot } from "@vercel/sandbox";
import { SANDBOX_TAG, foreignSandboxDeployment } from "./_sandbox/tags";
import {
  CHROME_RUNTIME_LIBRARY_PACKAGES,
  CORE_TOOLCHAIN_PACKAGES,
  PACKAGE_HELPER_SCRIPT,
  pkgInstall,
} from "./_sandbox_runtime/packageManager";
import { errorMessage } from "@vvedantb/server";

const SEED_PREP_LABEL_KEY = SANDBOX_TAG.purpose;
const SEED_PREP_LABEL_VALUE = "snapshot-seed-prep";

const SUPABASE_CLI_VERSION = "2.90.0";
const GH_CLI_VERSION = "2.72.0";
const GITHUB_RELEASE_CURL =
  "curl -fSL --http1.1 --retry 5 --retry-delay 5 --retry-all-errors";
const GITHUB_RELEASE_DOWNLOAD_FUNCTION = `github_release_download() {
  local repo="$1" tag="$2" asset="$3" output="$4" asset_url
  ${GITHUB_RELEASE_CURL} -o "$output" "https://github.com/$repo/releases/download/$tag/$asset" && return 0
  echo "Direct GitHub release download failed; retrying through release asset API"
  asset_url=$(${GITHUB_RELEASE_CURL} "https://api.github.com/repos/$repo/releases/tags/$tag" | jq -r --arg asset "$asset" '.assets[] | select(.name == $asset) | .url' | head -n 1)
  [ -n "$asset_url" ] && [ "$asset_url" != "null" ] || return 1
  ${GITHUB_RELEASE_CURL} -H "Accept: application/octet-stream" -H "X-GitHub-Api-Version: 2022-11-28" -o "$output" "$asset_url"
}`;
const RIPGREP_VERSION = "15.2.0";
const FD_VERSION = "10.4.2";
const GIT_LFS_VERSION = "3.7.1";
const CODE_SERVER_VERSION = "4.132.0";
const OPENCODE_VERSION = "1.18.16";
const CLAUDE_AGENT_SDK_VERSION = "0.3.282";
const CURSOR_SDK_VERSION = "1.0.28";

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

const SEED_ENV_FILE = "/tmp/.eva-seed-env.sh";

function renderSeedOnlyEnvFile(vars: Record<string, string>): string | null {
  const lines = Object.entries(vars)
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    .map(([key, value]) => `export ${key}=${quote([value])}`);
  return lines.length > 0 ? `${lines.join("\n")}\n` : null;
}

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
    branch: v.string(),
    buildCommands: v.array(v.string()),
    seedCommands: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await resolveSandboxCredentials(ctx, args.repoId);
    const [
      claudeCliVersion,
      codexCliVersion,
      startupCommands,
      backgroundCommands,
      stopCommands,
    ] = await Promise.all([
      resolveClaudeCliVersion(),
      resolveCodexCliVersion(),
      ctx.runQuery(internal.repoSnapshots.getStartupCommands, {
        repoId: args.repoId,
      }),
      ctx.runQuery(internal.repoSnapshots.getBackgroundCommands, {
        repoId: args.repoId,
      }),
      ctx.runQuery(internal.repoSnapshots.getStopCommands, {
        repoId: args.repoId,
      }),
    ]);
    const requireSupabaseDump = shouldCaptureSupabaseState([
      ...(startupCommands ?? []),
      ...(backgroundCommands ?? []),
      ...(stopCommands ?? []),
    ]);
    const lines: string[] = [
      "#!/bin/bash",
      "exec > /tmp/seedrun.log 2>&1",
      "set -x",
      renderEvaEnvFile(COREPACK_SANDBOX_ENV).trimEnd(),
      renderEvaEnvFile(DRIVE_CACHE_ENV).trimEnd(),
      GITHUB_RELEASE_DOWNLOAD_FUNCTION,
      PACKAGE_HELPER_SCRIPT,
      "rm -f /tmp/.seedrun-done",
    ];
    const seedOnlyVars = await resolveSeedOnlyEnvVars(ctx, args.repoId);
    const seedEnvFile = renderSeedOnlyEnvFile(seedOnlyVars);
    if (seedEnvFile !== null) {
      lines.push(
        "set +x",
        `if [ -f ${SEED_ENV_FILE} ]; then set -a; . ${SEED_ENV_FILE}; set +a; rm -f ${SEED_ENV_FILE}; echo "seed-only env vars loaded; xtrace off"; else echo "SEEDRUN-FAILED:seed-env-missing"; exit 1; fi`,
      );
    }
    lines.push(
      'echo "SEEDRUN-STAGE:toolchain"',
      "sudo mkdir -p /home/eva/.eva-snapshot-state && sudo chmod -R 777 /home/eva",
      `${pkgInstall(...CORE_TOOLCHAIN_PACKAGES)} || { echo "SEEDRUN-FAILED:toolchain-packages"; exit 1; }`,
      `${pkgInstall(...CHROME_RUNTIME_LIBRARY_PACKAGES)} || true`,
      FFMPEG_INSTALL_SCRIPT,
      buildSeedRunDockerStartCommand(),
      'corepack enable || sudo corepack enable || { echo "SEEDRUN-FAILED:corepack"; exit 1; }',
      'corepack prepare pnpm@10.33.4 --activate || { echo "SEEDRUN-FAILED:pnpm"; exit 1; }',
      "corepack prepare yarn@1.22.22 --activate || true",
      "git config --global --add safe.directory '*'",
      `command -v supabase >/dev/null 2>&1 || { github_release_download supabase/cli v${SUPABASE_CLI_VERSION} supabase_linux_amd64.tar.gz /tmp/sb.tgz && sudo tar -xzf /tmp/sb.tgz -C /usr/local/bin supabase; } || { echo "SEEDRUN-FAILED:supabase-cli"; exit 1; }`,
      '[ -e /usr/bin/supabase ] || sudo ln -sf "$(command -v supabase)" /usr/bin/supabase || { echo "SEEDRUN-FAILED:supabase-cli-symlink"; exit 1; }',
      `command -v gh >/dev/null 2>&1 || { github_release_download cli/cli v${GH_CLI_VERSION} gh_${GH_CLI_VERSION}_linux_amd64.tar.gz /tmp/gh.tgz && sudo tar -xzf /tmp/gh.tgz -C /tmp && sudo mv /tmp/gh_${GH_CLI_VERSION}_linux_amd64/bin/gh /usr/local/bin/gh && rm -rf /tmp/gh.tgz /tmp/gh_${GH_CLI_VERSION}_linux_amd64; } || eva_pkg_install_gh || { echo "SEEDRUN-FAILED:gh-cli"; exit 1; }`,
      `command -v rg >/dev/null 2>&1 || { github_release_download BurntSushi/ripgrep ${RIPGREP_VERSION} ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl.tar.gz /tmp/rg.tgz && sudo tar -xzf /tmp/rg.tgz -C /tmp && sudo mv /tmp/ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl/rg /usr/local/bin/rg && rm -rf /tmp/rg.tgz /tmp/ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl; } || { echo "SEEDRUN-FAILED:ripgrep"; exit 1; }`,
      `command -v fd >/dev/null 2>&1 || { github_release_download sharkdp/fd v${FD_VERSION} fd-v${FD_VERSION}-x86_64-unknown-linux-musl.tar.gz /tmp/fd.tgz && sudo tar -xzf /tmp/fd.tgz -C /tmp && sudo mv /tmp/fd-v${FD_VERSION}-x86_64-unknown-linux-musl/fd /usr/local/bin/fd && rm -rf /tmp/fd.tgz /tmp/fd-v${FD_VERSION}-x86_64-unknown-linux-musl; } || { echo "SEEDRUN-FAILED:fd"; exit 1; }`,
      `command -v git-lfs >/dev/null 2>&1 || { github_release_download git-lfs/git-lfs v${GIT_LFS_VERSION} git-lfs-linux-amd64-v${GIT_LFS_VERSION}.tar.gz /tmp/lfs.tgz && sudo tar -xzf /tmp/lfs.tgz -C /tmp && sudo mv /tmp/git-lfs-${GIT_LFS_VERSION}/git-lfs /usr/local/bin/git-lfs && rm -rf /tmp/lfs.tgz /tmp/git-lfs-${GIT_LFS_VERSION}; } || { echo "SEEDRUN-FAILED:git-lfs"; exit 1; }`,
      '[ -e /usr/local/bin/git-lfs ] || sudo ln -sf "$(command -v git-lfs)" /usr/local/bin/git-lfs || { echo "SEEDRUN-FAILED:git-lfs-symlink"; exit 1; }',
      "sudo mkdir -p /opt/git/etc",
      'sudo /usr/local/bin/git-lfs install --system || { echo "SEEDRUN-FAILED:git-lfs-filters"; exit 1; }',
      'sudo env GIT_CONFIG_SYSTEM=/etc/gitconfig /usr/local/bin/git-lfs install --system || { echo "SEEDRUN-FAILED:git-lfs-filters"; exit 1; }',
      `command -v claude >/dev/null 2>&1 && command -v codex >/dev/null 2>&1 && ${globalPackageIsVersion("@anthropic-ai/claude-code", claudeCliVersion)} && ${globalPackageIsVersion("@anthropic-ai/claude-agent-sdk", CLAUDE_AGENT_SDK_VERSION)} && ${globalPackageIsVersion("@openai/codex", codexCliVersion)} && ${globalPackageIsVersion("@cursor/sdk", CURSOR_SDK_VERSION)} || sudo npm install -g @anthropic-ai/claude-code@${claudeCliVersion} @anthropic-ai/claude-agent-sdk@${CLAUDE_AGENT_SDK_VERSION} @openai/codex@${codexCliVersion} agent-browser convex @cursor/sdk@${CURSOR_SDK_VERSION} || { echo "SEEDRUN-FAILED:agent-clis"; exit 1; }`,
      `command -v opencode >/dev/null 2>&1 && ${globalPackageIsVersion("@opencode-ai/sdk", OPENCODE_VERSION)} || sudo npm install -g opencode-ai@${OPENCODE_VERSION} @opencode-ai/sdk@${OPENCODE_VERSION} || { echo "SEEDRUN-FAILED:opencode-cli"; exit 1; }`,
      `command -v code-server >/dev/null 2>&1 || { if [ "$(eva_pkg_file_ext)" = deb ]; then github_release_download coder/code-server v${CODE_SERVER_VERSION} code-server_${CODE_SERVER_VERSION}_amd64.deb /tmp/code-server.deb; else github_release_download coder/code-server v${CODE_SERVER_VERSION} code-server-${CODE_SERVER_VERSION}-amd64.rpm /tmp/code-server.rpm; fi && eva_pkg_install_file /tmp/code-server.$(eva_pkg_file_ext) && rm -f /tmp/code-server.deb /tmp/code-server.rpm; } || { echo "SEEDRUN-FAILED:code-server"; exit 1; }`,
      'command -v websockify >/dev/null 2>&1 || python3 -m pip install --user --break-system-packages websockify >/tmp/websockify-pip.log 2>&1 || python3 -m pip install --user websockify >/tmp/websockify-pip.log 2>&1 || { echo "SEEDRUN-FAILED:websockify"; exit 1; }',
      "sudo ln -sf $(python3 -m site --user-base)/bin/websockify /usr/local/bin/websockify 2>/dev/null || true",
      '[ -d /opt/novnc ] || { sudo rm -rf /opt/noVNC; sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc; } || { echo "SEEDRUN-FAILED:novnc"; exit 1; }',
      'eva_pkg_install_chrome || { echo "SEEDRUN-FAILED:chrome"; exit 1; }',
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

    lines.push(
      'echo "SEEDRUN-STAGE:swap"',
      `echo ${Buffer.from(buildEnsureSwapScript(resolveSwapConfig()), "utf8").toString("base64")} | base64 -d > /tmp/eva-ensure-swap.sh && bash /tmp/eva-ensure-swap.sh || true`,
    );
    lines.push(
      'echo "SEEDRUN-STAGE:update"',
      'cd /tmp/repo || { echo "SEEDRUN-FAILED:no-repo"; exit 1; }',
      `( git checkout -f ${args.branch} 2>/dev/null || git checkout -fb ${args.branch} origin/${args.branch} ) && git reset --hard origin/${args.branch} || { echo "SEEDRUN-FAILED:git-reset"; exit 1; }`,
    );
    lines.push(
      'echo "SEEDRUN-STAGE:install"',
      'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile 2>&1 | tee /tmp/seed-install.log; [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "SEEDRUN-FAILED:install"; exit 1; }; grep -q "Ignored build scripts" /tmp/seed-install.log && echo "SEEDRUN-WARN:ignored-build-scripts"; elif [ -f yarn.lock ]; then yarn install || echo "SEEDRUN-WARN:install-yarn"; elif [ -f package-lock.json ]; then npm ci || npm install || echo "SEEDRUN-WARN:install-npm"; elif [ -f package.json ]; then npm install || echo "SEEDRUN-WARN:install-npm"; else echo "SEEDRUN: skip node install (no package manifest)"; fi',
      `if [ -f requirements.txt ] || [ -f pyproject.toml ]; then ${pkgInstall("gcc", "g++", "make", "python3-dev", "libpq-dev")} || true; fi`,
      'if [ -f requirements.txt ]; then python3 -m pip install --user --break-system-packages -r requirements.txt >/tmp/pip-install.log 2>&1 || python3 -m pip install --user -r requirements.txt >>/tmp/pip-install.log 2>&1 || { tail -50 /tmp/pip-install.log; echo "SEEDRUN-WARN:install-pip"; }; elif [ -f pyproject.toml ]; then python3 -m pip install --user --break-system-packages -e . >/tmp/pip-install.log 2>&1 || python3 -m pip install --user -e . >>/tmp/pip-install.log 2>&1 || { tail -50 /tmp/pip-install.log; echo "SEEDRUN-WARN:install-pip"; }; fi',
    );
    lines.push(
      'echo "SEEDRUN-STAGE:docker-bootstrap"',
      `command -v docker >/dev/null 2>&1 || ${pkgInstall("docker")} || { echo "SEEDRUN-FAILED:docker-install"; exit 1; }`,
      'sudo docker info >/dev/null 2>&1 || sudo systemctl start docker 2>&1 || { echo "SEEDRUN-FAILED:docker-start"; exit 1; }',
      "sudo chmod 666 /var/run/docker.sock 2>/dev/null || true",
      "until docker info >/dev/null 2>&1; do sleep 1; done",
    );
    args.buildCommands.forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:build-${i}"; exit 1; }`,
      );
    });
    lines.push('echo "SEEDRUN-STAGE:daemons"');
    (backgroundCommands ?? []).forEach((command, i) => {
      const scriptBody = isConvexBackendCommand(command)
        ? buildConvexBackgroundScriptBody(command)
        : command;
      const cb64 = Buffer.from(scriptBody, "utf8").toString("base64");
      lines.push(
        `echo ${cb64} | base64 -d > /tmp/bg-cmd-${i}.sh && chmod +x /tmp/bg-cmd-${i}.sh && setsid nohup bash -l /tmp/bg-cmd-${i}.sh </dev/null > /tmp/bg-${i}.log 2>&1 & echo $! > /tmp/bg-${i}.pid`,
      );
    });
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
        `echo "SEEDRUN-STAGE:convex-functions-ready-${i}"`,
        `for s in $(seq 1 ${CONVEX_FUNCTIONS_READY_ATTEMPTS}); do`,
        `  grep -q "${CONVEX_FUNCTIONS_READY_LOG_LINE}" /tmp/bg-${i}.log 2>/dev/null && break`,
        `  if [ -f /tmp/bg-${i}.pid ] && ! kill -0 "$(cat /tmp/bg-${i}.pid)" 2>/dev/null; then echo "convex-ready-${i}: daemon exited"; break; fi`,
        "  sleep 5",
        "done",
        `grep -q "${CONVEX_FUNCTIONS_READY_LOG_LINE}" /tmp/bg-${i}.log 2>/dev/null && echo "convex-ready-${i}: functions pushed; safe to import" || echo "convex-ready-${i}: backend up, functions not pushed yet — seed commands run next"`,
      );
    });
    const runsConvex = (backgroundCommands ?? []).some(isConvexBackendCommand);
    if (runsConvex) lines.push(...buildConvexBackendWatchdogLines("/tmp/repo"));
    lines.push('echo "SEEDRUN-STAGE:startup-post-daemon"');
    (startupCommands ?? []).forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:startup-post-${i}"; exit 1; }`,
      );
    });
    lines.push('echo "SEEDRUN-STAGE:seed-commands"');
    args.seedCommands.forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:seed-${i}"; exit 1; }`,
      );
    });
    if (runsConvex) {
      lines.push(...buildConvexPostSeedPushLines("/tmp/repo"));
    }
    lines.push(...seededRuntimeStateCaptureLines(requireSupabaseDump));
    lines.push(
      `printf %s ${computeStartupFingerprint(startupCommands ?? [])} > ${STARTUP_MARKER_PATH}`,
    );
    if (runsConvex) lines.push(STOP_CONVEX_BACKEND_WATCHDOG_LINE);
    (stopCommands ?? []).forEach((command, i) => {
      lines.push(
        `( ${command} ) || { echo "SEEDRUN-FAILED:stop-${i}"; exit 1; }`,
      );
    });
    lines.push('echo "SEEDRUN-DONE"', "touch /tmp/.seedrun-done");
    const script = lines.join("\n");
    const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const alreadyRunning = await execHandle(
      sandbox,
      'pgrep -f "[s]eedrun.sh" >/dev/null && echo ALREADY-RUNNING || echo NOT-RUNNING',
      30,
    );
    if (!alreadyRunning.includes("ALREADY-RUNNING")) {
      await execHandle(
        sandbox,
        `rm -f /tmp/.seedrun-done /tmp/seedrun.log /tmp/seedrun.sh ${SEED_ENV_FILE}`,
        30,
      );
      if (seedEnvFile !== null) {
        await writeSandboxFile(sandbox, SEED_ENV_FILE, seedEnvFile);
        await execHandle(sandbox, `chmod 600 ${SEED_ENV_FILE}`, 30);
      }
      await writeSandboxFile(sandbox, "/tmp/seedrun.sh", script);
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
          'echo "== toolchain =="',
          '( cd /tmp/repo && node --version 2>&1; corepack --version 2>&1; echo "pnpm $(pnpm --version 2>&1 | tail -n 1)"; grep -o \'"packageManager": *"[^"]*"\' package.json 2>/dev/null || echo \'packageManager: (none)\'; echo lastKnownGood: $(cat ~/.cache/node/corepack/lastKnownGood.json 2>/dev/null | tr -d \' \\n\') )',
          'echo "== install log (warnings) =="',
          "grep -aE 'Ignored build|ERR_PNPM|WARN|Done in .* using pnpm' /tmp/seed-install.log 2>/dev/null | tail -n 20",
          'echo "== disk =="',
          "df -h / 2>&1; du -xsh /swapfile /tmp/repo/node_modules ~/.local/share/pnpm ~/.cache ~/.convex 2>/dev/null || true",
          'echo "== 3210 listening? =="',
          "curl -s -o /dev/null -w 'backend http:%{http_code}\\n' http://127.0.0.1:3210 2>&1 || echo '3210 unreachable'",
          'echo "== memory =="',
          "free -m 2>&1; sudo dmesg 2>/dev/null | grep -iE 'out of memory|killed process' | tail -n 10",
          'echo "== seedrun.log (tail) =="; tail -c 16000 /tmp/seedrun.log 2>/dev/null',
          'for f in /tmp/bg-*.log; do echo; echo "== $f =="; tail -c 3000 "$f" 2>/dev/null; done',
          "true",
        ].join("; "),
        90,
      );
    } catch (e) {
      return `diagnostics unavailable: ${errorMessage(e)}`;
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
  args: {
    repoId: v.id("githubRepos"),
    imageSnapshot: v.optional(v.string()),
  },
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
    const [resolved, repo] = await Promise.all([
      tryResolveSandboxCredentials(ctx, args.repoId),
      ctx.runQuery(internal.repoSnapshots.getRepo, { repoId: args.repoId }),
    ]);
    if (!resolved.ok) {
      console.warn(`[snapshot] createSeedPrepSandbox: ${resolved.error}`);
      return { ok: false, error: resolved.error };
    }
    const { credentials, sandboxEnvVars } = resolved;
    const client = getSandboxClient(credentials);
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
      args.imageSnapshot,
      undefined,
      undefined,
      { mode: "all" },
      180,
      true,
      undefined,
      DRIVE_CACHE_WRITER,
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
      console.error(
        `[snapshot] deleteSeedPrepSandbox: failed to delete ${args.sandboxId}: ${errorMessage(
          e,
        )}`,
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
  returns: v.object({ snapshotId: v.string() }),
  handler: async (ctx, args): Promise<{ snapshotId: string }> => {
    const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
    const client = getSandboxClient(credentials);
    const handle = await client.get(args.sandboxId);
    await releaseSwapFile(handle);
    const { snapshotId } = await handle.createSnapshot({
      name: args.seededName,
    });
    return { snapshotId };
  },
});

/**
 * Seeded-snapshot build — POLL step. Returns the snapshot entity's current state
 * ("ready" on success, "error" on failure, "pending" while it is still
 * capturing or not registered yet).
 *
 * We poll the SNAPSHOT entity, not the sandbox state: a sandbox snapshot can
 * be ready while the source sandbox still reports "snapshotting", so a
 * sandbox-state poll can wait out the whole window and wrongly record a fallback
 * for a snapshot that actually succeeded. The snapshot's own state is the
 * authoritative signal — the same one the base-Image build polls.
 */
export const pollSeededSnapshotState = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    seededName: v.string(),
  },
  returns: v.union(
    v.literal("ready"),
    v.literal("pending"),
    v.literal("error"),
  ),
  handler: async (ctx, args): Promise<SnapshotState> => {
    const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
    const client = getSandboxClient(credentials);
    const snapshot = await client.getSnapshot(args.seededName);
    if (!snapshot) return "pending";
    return snapshot.status;
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
      const seedableSet = new Set<string>(args.seedableRepoIds);
      const list = await Sandbox.list({
        token: credentials.token,
        teamId: credentials.teamId,
        projectId: credentials.projectId,
      });
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
            `[snapshot] stopAllRepoSandboxes: failed to delete ${meta.name}: ${errorMessage(
              err,
            )}`,
          );
        }
      }
      console.log(
        `[snapshot] stopAllRepoSandboxes: deleted ${deleted} vercel seed-prep sandbox(es)`,
      );
    } catch (e) {
      console.error(
        `[snapshot] stopAllRepoSandboxes: best-effort sweep failed: ${errorMessage(
          e,
        )}`,
      );
    }
    return null;
  },
});

/**
 * Deletes a seeded snapshot by its id/name so previous `snap_*` captures don't
 * accumulate — the single-snapshot build makes a fresh capture each run.
 * Best-effort: a missing snapshot just no-ops (deleteSnapshot returns false).
 */
export const deleteSeededSnapshot = internalAction({
  args: { snapshotName: v.string(), repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const { credentials } = await resolveSandboxCredentials(ctx, args.repoId);
      const client = getSandboxClient(credentials);
      const deleted = await client.deleteSnapshot(args.snapshotName);
      console.log(
        deleted
          ? `[snapshot] deleteSeededSnapshot: deleted ${args.snapshotName}`
          : `[snapshot] deleteSeededSnapshot: ${args.snapshotName} not found (already gone)`,
      );
    } catch (e) {
      console.error(
        `[snapshot] deleteSeededSnapshot: failed to delete ${args.snapshotName}: ${errorMessage(
          e,
        )}`,
      );
    }
    return null;
  },
});

/**
 * One-shot / ops cleanup: delete every Vercel snap_* in the project that is not
 * (1) a seeded / base Image capture, or (2) the currentSnapshotId of a sandbox
 * Eva still references. Ghost sandboxes that only exist in Sandbox.list are
 * not protected — their snaps are orphans. A sandbox tagged with another
 * Convex deployment keeps its snap: this deployment cannot know its owner rows.
 *
 * `minIdleMs` also keeps any snap created or restored inside that window. The
 * weekly cron sets it: a snapshot has no owner tag, so recent use is the only
 * sign that a capture in flight or another deployment's base Image needs it.
 *
 *   npx convex run snapshotActions:purgeUnreferencedVercelSnapshots --prod '{"repoId":"…"}'
 */
export const purgeUnreferencedVercelSnapshots = internalAction({
  args: { repoId: v.id("githubRepos"), minIdleMs: v.optional(v.number()) },
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
    for (const name of await ctx.runQuery(
      internal.repoGroups.listAllGroupSnapshotNames,
      {},
    )) {
      protectedIds.add(name);
    }
    const listedSandboxes: Array<{
      name: string;
      foreign: boolean;
      currentSnapshotId: string | undefined;
    }> = [];
    for await (const sandbox of await Sandbox.list(creds)) {
      const currentId = sandbox.currentSnapshotId;
      listedSandboxes.push({
        name: sandbox.name,
        foreign: foreignSandboxDeployment(sandbox.tags) !== null,
        currentSnapshotId:
          typeof currentId === "string" && currentId.length > 0
            ? currentId
            : undefined,
      });
    }
    const knownSandboxIds = new Set<string>();
    for (let i = 0; i < listedSandboxes.length; i += 500) {
      const batch = listedSandboxes.slice(i, i + 500).map((s) => s.name);
      for (const id of await ctx.runQuery(
        internal.repoSnapshots.listReferencedSandboxIds,
        { sandboxIds: batch },
      )) {
        knownSandboxIds.add(id);
      }
    }
    const liveSandboxCount = listedSandboxes.length;
    let evaSandboxCount = 0;
    for (const sandbox of listedSandboxes) {
      const ours = knownSandboxIds.has(sandbox.name);
      if (!ours && !sandbox.foreign) continue;
      if (ours) evaSandboxCount += 1;
      if (sandbox.currentSnapshotId !== undefined) {
        protectedIds.add(sandbox.currentSnapshotId);
      }
    }

    const listed = await Snapshot.list(creds);
    const idleCutoff = Date.now() - (args.minIdleMs ?? 0);
    let deletedCount = 0;
    let skippedCount = 0;
    for await (const meta of listed) {
      if (protectedIds.has(meta.id)) {
        skippedCount += 1;
        continue;
      }
      if (Math.max(meta.createdAt, meta.lastUsedAt ?? 0) > idleCutoff) {
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
          `[snapshot] purgeUnreferencedVercelSnapshots: failed ${meta.id}: ${errorMessage(
            error,
          )}`,
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
    minIdleMs: v.optional(v.number()),
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
          { repoId, minIdleMs: args.minIdleMs },
        );
        deleted += result.deletedCount;
        protectedCount += result.protectedCount;
        skipped += result.skippedCount;
        projects += 1;
      }
    } catch (err) {
      console.warn(
        `[purgeUnreferencedVercelSnapshotsAll] skip repo=${repoId}: ${errorMessage(
          err,
        )}`,
      );
    }

    const nextIndex = repoIndex + 1;
    if (nextIndex < repoIds.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.snapshotActions.purgeUnreferencedVercelSnapshotsAll,
        {
          minIdleMs: args.minIdleMs,
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

const SCHEDULED_PURGE_MIN_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Weekly cron entry for {@link purgeUnreferencedVercelSnapshotsAll}: orphan
 * snapshots bill Snapshot Storage until someone deletes them.
 *
 * Shares `appSettings.sandboxIdlePauseMode` with the idle and leak sweeps. A
 * dev deployment that mirrors prod holds prod's Vercel credentials and a stale
 * copy of its sessions, so it would read prod's newer snapshots as orphans;
 * the sync script switches the mode `off` there.
 */
export const purgeOrphanSnapshotsScheduled = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { mode } = await ctx.runQuery(
      internal.sandboxIdlePause.getSettingsInternal,
      {},
    );
    if (mode !== "on") return null;
    await ctx.runAction(
      internal.snapshotActions.purgeUnreferencedVercelSnapshotsAll,
      { minIdleMs: SCHEDULED_PURGE_MIN_IDLE_MS },
    );
    return null;
  },
});
