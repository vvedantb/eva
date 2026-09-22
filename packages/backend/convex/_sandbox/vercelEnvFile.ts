/** Path for the sourced env file written into Vercel sandboxes. */
export const EVA_ENV_FILE = "/vercel/sandbox/.eva-env.sh";

/** Shell snippet that loads sandbox env when the file exists. */
export const EVA_ENV_SOURCE_CMD = `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE}`;

/**
 * Corepack env every sandbox shell gets (session env file AND the seed script).
 *
 * DEFAULT_TO_LATEST=0: for a repo with no `packageManager` pin, Corepack
 * otherwise resolves npm's `latest` dist-tag (pnpm 12.3.4 as of Sept 2026)
 * whenever the shell has no Last Known Good file — session sandboxes never
 * run `corepack prepare`, so that is every session shell. A pnpm major
 * changes build-script policy (11+ dropped `onlyBuiltDependencies`), which
 * is how carepulse-ts lost its `supabase` CLI binary in Sept 2026 after its
 * own pin moved to pnpm 12. With it off, Corepack uses the LKG (the seed
 * activates pnpm@10.33.4) or its bundled default: the version only changes
 * when the repo pin or eva's toolchain changes, never when npm retags.
 * DOWNLOAD_PROMPT=0: non-interactive shells must never hang on the prompt.
 */
export const COREPACK_SANDBOX_ENV: Record<string, string> = {
  COREPACK_DEFAULT_TO_LATEST: "0",
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
};

/** Renders env vars as sourceable `export K='V'` lines (single-quote-escaped). */
export function renderEvaEnvFile(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
      .join("\n") + "\n"
  );
}

/**
 * `tmux new-session` command that starts an interactive bash with sandbox env
 * already loaded (so Console typing matches agent/`exec` and launch scripts).
 */
export function tmuxNewSessionWithEvaEnv(
  sessionName: string,
  cwd: string,
): string {
  // Single-quoted -c body: EVA_ENV_SOURCE_CMD has no quotes.
  return `tmux new-session -d -s ${sessionName} -c ${cwd} -- bash -c '${EVA_ENV_SOURCE_CMD}; exec bash -i'`;
}

/**
 * Installs login + interactive hooks so new bash shells source sandbox env.
 * Idempotent (marker-guarded for bashrc).
 *
 * Must stay valid when vercel exec runs `bash -lc "${SOURCE_ENV} ${cmd}"` —
 * never split `for …; do` across `;` joins (`do;` is a bash syntax error).
 */
export function ensureEvaEnvInteractiveHookScript(): string {
  const marker = "# eva-sandbox-env";
  return [
    `printf '%s\\n' '${EVA_ENV_SOURCE_CMD}' | sudo tee /etc/profile.d/eva-sandbox-env.sh >/dev/null`,
    `sudo chmod 644 /etc/profile.d/eva-sandbox-env.sh`,
    // Entire for-loop is one statement so join("; ") cannot produce `do;`.
    `for rc in /home/eva/.bashrc /root/.bashrc; do grep -qF '${marker}' "$rc" 2>/dev/null || printf '%s\\n' '' '${marker}' '${EVA_ENV_SOURCE_CMD}' >> "$rc" 2>/dev/null || true; done`,
  ].join("; ");
}
