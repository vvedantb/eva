"use node";

import { randomBytes } from "crypto";
import type { GenericActionCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { SandboxHandle } from "../_sandbox/provider";
import {
  execHandle,
  LEGACY_WORKSPACE_DIR,
  requireEnv,
  WORKSPACE_DIR,
} from "./helpers";
import { writeSandboxFile } from "./sandboxFiles";
import { resolvePublicConvexSiteUrl } from "../_env/publicConvexUrls";

const HELPER_SCRIPT_PATH = "/home/eva/.local/bin/git-credential-eva";
const HELPER_CONFIG_DIR = "/home/eva/.config/eva";
const HELPER_CONFIG_PATH = `${HELPER_CONFIG_DIR}/git-credentials.env`;

// Repositories that may have a URL-embedded GitHub token in `.git/config` from
// either a legacy clone or a baked snapshot. We scrub each on every helper
// install so git uses our credential helper instead of stale URL credentials.
const KNOWN_REPO_DIRS = [WORKSPACE_DIR, LEGACY_WORKSPACE_DIR];

// Bash credential helper. Git invokes it with `get` and supplies the
// host/proto/path on stdin; we read the `path=` line (git sends it because the
// install sets `credential.useHttpPath`) and forward it. We POST the
// per-sandbox bearer secret plus that path to the eva backend, which mints a
// full installation token for the sandbox's own repo and a read-only,
// single-repository token for any other repo its owner can reach in eva.
// A short per-path file cache trims duplicate mints during a single git
// operation (clone/fetch/push fan out into several helper invocations).
const HELPER_SCRIPT = `#!/usr/bin/env bash
set -u

if [ "\${1:-}" != "get" ]; then
  cat >/dev/null 2>&1 || true
  exit 0
fi

REQ_PATH=""
while IFS= read -r LINE; do
  case "$LINE" in
    path=*) REQ_PATH="\${LINE#path=}" ;;
  esac
done

CONFIG_FILE="${HELPER_CONFIG_PATH}"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "git-credential-eva: missing $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$CONFIG_FILE"

if [ -z "\${EVA_SANDBOX_SECRET:-}" ] || [ -z "\${CONVEX_SITE_URL:-}" ]; then
  echo "git-credential-eva: incomplete config in $CONFIG_FILE" >&2
  exit 1
fi

CACHE_KEY=$(printf '%s' "\${REQ_PATH:-home}" | cksum | cut -d' ' -f1)
CACHE_FILE="/tmp/git-cred-cache-$CACHE_KEY"
CACHE_TTL_SECONDS=3000

if [ -f "$CACHE_FILE" ]; then
  CACHE_TS=$(head -n1 "$CACHE_FILE" 2>/dev/null || printf 0)
  NOW=$(date +%s)
  AGE=$((NOW - CACHE_TS))
  if [ "$AGE" -ge 0 ] && [ "$AGE" -lt "$CACHE_TTL_SECONDS" ]; then
    CACHED_TOKEN=$(tail -n +2 "$CACHE_FILE")
    if [ -n "$CACHED_TOKEN" ]; then
      printf 'username=x-access-token\\npassword=%s\\n' "$CACHED_TOKEN"
      exit 0
    fi
  fi
fi

if [ -n "$REQ_PATH" ]; then
  REQ_BODY=$(jq -cn --arg p "$REQ_PATH" '{path:$p}')
else
  REQ_BODY='{}'
fi

RESPONSE=$(curl -fsSL -X POST \\
  -H "Authorization: Bearer $EVA_SANDBOX_SECRET" \\
  -H "Content-Type: application/json" \\
  --data "$REQ_BODY" \\
  "$CONVEX_SITE_URL/api/git-credentials") || {
    echo "git-credential-eva: token fetch failed (no access?)" >&2
    exit 1
  }

TOKEN=$(printf '%s' "$RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "git-credential-eva: empty token in response" >&2
  exit 1
fi

umask 077
printf '%s\\n%s\\n' "$(date +%s)" "$TOKEN" > "$CACHE_FILE"

printf 'username=x-access-token\\npassword=%s\\n' "$TOKEN"
`;

/** Resolves the public Convex site URL used by the in-sandbox credential helper. */
function resolveConvexSiteUrl(): string {
  return (
    resolvePublicConvexSiteUrl(process.env) ??
    requireEnv("CONVEX_CLOUD_URL").replace(".convex.cloud", ".convex.site")
  );
}

/**
 * Installs the eva git credential helper inside the sandbox and binds it
 * to a fresh per-sandbox bearer secret stored in `sandboxGitCredentials`. After
 * this runs, the sandbox can run `git fetch`/`git push` against
 * `https://github.com/...` without any token in the URL — the helper mints a
 * fresh installation token on demand via the eva backend.
 *
 * Idempotent: re-running rotates the secret and re-writes the helper script.
 */
export async function ensureGitCredentialHelper(
  ctx: GenericActionCtx<DataModel>,
  sandbox: SandboxHandle,
  installationId: number,
): Promise<void> {
  const secret = randomBytes(32).toString("hex");
  await ctx.runMutation(internal.sandboxGitCredentials.upsertForSandbox, {
    sandboxId: sandbox.id,
    installationId,
    secret,
  });

  const siteUrl = resolveConvexSiteUrl();
  const envFileContent = `EVA_SANDBOX_SECRET=${secret}\nCONVEX_SITE_URL=${siteUrl}\n`;

  await writeSandboxFile(sandbox, HELPER_SCRIPT_PATH, HELPER_SCRIPT);
  await writeSandboxFile(sandbox, HELPER_CONFIG_PATH, envFileContent);

  // Legacy snapshots and pre-helper clones embed the installation token in
  // `remote.origin.url` (e.g. `https://x-access-token:ghs_xxx@github.com/...`).
  // Git uses URL-embedded credentials in preference to a credential helper, so
  // any in-sandbox `git pull` would keep failing with the expired baked token.
  // Strip embedded creds from any known repo's `.git/config` so the helper is
  // consulted instead. The sed pattern matches `user:password@github.com` and
  // rewrites it to bare `github.com`, regardless of token value.
  const repoCleanupSteps = KNOWN_REPO_DIRS.flatMap((dir) => [
    `if [ -f ${dir}/.git/config ]; then sed -i -E 's|(https?://)[^@/[:space:]]+:[^@/[:space:]]+@github\\.com/|\\1github.com/|g' ${dir}/.git/config; fi`,
    `if [ -d ${dir}/.git ]; then git -C ${dir} config --unset-all http.https://github.com/.extraheader 2>/dev/null || true; fi`,
  ]);

  await execHandle(
    sandbox,
    [
      `mkdir -p ${HELPER_CONFIG_DIR}`,
      `chmod 700 ${HELPER_CONFIG_DIR}`,
      `chmod 600 ${HELPER_CONFIG_PATH}`,
      `chmod 755 ${HELPER_SCRIPT_PATH}`,
      // Stale cache from a prior secret/token must not be reused under the new secret.
      `rm -f /tmp/git-cred-cache /tmp/git-cred-cache-*`,
      // Wipe any inherited URL-embedded token / extraheader before switching to the helper.
      `git config --global --unset-all http.https://github.com/.extraheader 2>/dev/null || true`,
      // Reset credential.helper to exactly `''` + our helper. `--unset-all`
      // first so re-runs don't error with "credential.helper has multiple
      // values" — git's plain `config` refuses to overwrite a multi-valued
      // key, which is the state we leave behind after one install.
      `git config --global --unset-all credential.helper 2>/dev/null || true`,
      `git config --global --add credential.helper ''`,
      `git config --global --add credential.helper ${HELPER_SCRIPT_PATH}`,
      `git config --global --replace-all credential.https://github.com.helper ${HELPER_SCRIPT_PATH}`,
      // Makes git send `path=owner/repo.git` on stdin so the helper can ask for
      // a read-only token for a sibling repo instead of the sandbox's own.
      `git config --global credential.https://github.com.useHttpPath true`,
      // Agents often `git pull` without a strategy; modern git fatals otherwise.
      `git config --global pull.rebase true`,
      ...repoCleanupSteps,
    ].join(" && "),
    20,
  );
}
