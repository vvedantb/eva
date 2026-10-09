/**
 * Durable swap provisioning for sandboxes.
 *
 * Repos that restore a large local Convex backend snapshot (CarePulse
 * eProcurement: ~300k–1M+ docs) spike memory transiently on every sandbox
 * start: the backend's first open, each `convex dev` prepare/push (bundle +
 * schema-validate against all restored docs) and a `next dev` cold compile
 * stack up. Observed 2026-08-07: the kernel OOM-killed convex-local-backend at
 * ~11.5 GB RSS on a 16 GB box with zero swap, while the same backend idles at
 * ~1.2 GB once up.
 *
 * More RAM is not an option: Vercel Sandbox allocates 2 GB per vCPU and the
 * Pro plan caps a sandbox at 8 vCPUs / 16 GB (Evalucom is on Pro, and
 * vercelProvider already asks for 8), so the box in that incident was already
 * at the ceiling. Disk is likewise fixed at 32 GB on every plan. That leaves
 * swap, which only has to absorb a transient spike.
 *
 * A hand-made swapfile does not survive a sandbox restart, so eva provisions it
 * itself on every path that can precede a memory spike, for every sandbox owner
 * (session, quick task, project chat, seed prep):
 * - `createSandbox` post-create, before dependency install and build;
 * - every boot via `ensureSandboxRunning` (and the early-ready resume path,
 *   which skips that bootstrap to unlock the UI sooner);
 * - `runBackgroundCommands`, immediately before `convex dev` launches;
 * - both dev-server launchers, so a cold `next dev` compile on a lazily resumed
 *   VM (preview self-heal, task dev-server re-run) is covered too;
 * - the seeded-snapshot seed run, before its install/build/daemon stages.
 * Each call re-runs the same idempotent script, which no-ops in one exec when
 * swap is already active.
 *
 * Sizing is disk-bound, not memory-bound: the VM has ~6–13 GB free after a
 * snapshot restore, and a 12 GB swapfile has already filled the disk to 100%
 * and broken writes. We take the smaller of the requested size and
 * (free − reserve), and skip entirely when that leaves too little to matter.
 */
import type { SandboxHandle } from "../_sandbox/provider";
import { writeSandboxFile } from "./sandboxFiles";
import { errorText } from "../_shared/errors";

/** Swapfile location. On `/`, which is a real fs (fallocate-capable). */
export const SWAP_FILE_PATH = "/swapfile";

const ENSURE_SCRIPT_PATH = "/tmp/eva-ensure-swap.sh";
const RELEASE_SCRIPT_PATH = "/tmp/eva-release-swap.sh";

/** Every status line the script prints, so callers can log one line. */
const MARKER_PREFIX = "eva-swap:";

export type SwapConfig = {
  /** Requested swap size in MiB, capped by free disk. */
  sizeMib: number;
  /** Free disk (MiB) the swapfile must never eat into. */
  reserveMib: number;
  /** Below this a swapfile cannot absorb the spike, so we skip it. */
  minMib: number;
};

/** 6 GiB: covers the observed spike while leaving build headroom on a 32 GB disk. */
export const DEFAULT_SWAP_SIZE_MIB = 6144;
/** 5 GiB free-disk floor — below that, sandbox writes start failing. */
export const DEFAULT_SWAP_RESERVE_MIB = 5120;
/** 2 GiB: smaller swap does not meaningfully change the OOM outcome. */
export const DEFAULT_SWAP_MIN_MIB = 2048;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads the tunables. All three are env-overridable for per-deployment tuning. */
export function resolveSwapConfig(): SwapConfig {
  return {
    sizeMib: positiveIntEnv("SANDBOX_SWAP_SIZE_MIB", DEFAULT_SWAP_SIZE_MIB),
    reserveMib: positiveIntEnv(
      "SANDBOX_SWAP_RESERVE_MIB",
      DEFAULT_SWAP_RESERVE_MIB,
    ),
    minMib: positiveIntEnv("SANDBOX_SWAP_MIN_MIB", DEFAULT_SWAP_MIN_MIB),
  };
}

/** True when the kill switch is set, so no sandbox gets a swapfile. */
export function swapProvisioningDisabled(): boolean {
  return process.env.SANDBOX_SWAP_DISABLED === "1";
}

/**
 * Shell script that makes `/swapfile` active, idempotently.
 *
 * Always exits 0: swap is an optimisation, never a reason to fail a boot. The
 * outcome is reported on a single `eva-swap:` line instead.
 */
export function buildEnsureSwapScript(config: SwapConfig): string {
  return [
    "set -u",
    `SWAP=${SWAP_FILE_PATH}`,
    `WANT=${config.sizeMib}`,
    `RESERVE=${config.reserveMib}`,
    `MIN=${config.minMib}`,
    "",
    "avail_mib() { df -Pm / 2>/dev/null | awk 'NR==2 {print $4}'; }",
    'file_mib() { s=$(stat -c %s "$SWAP" 2>/dev/null || echo 0); echo $((s / 1048576)); }',
    "",
    // Already swapping: nothing to do. This is the common case on a resume
    // where the VM kept running, and makes repeat calls per boot free.
    'if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAP"; then',
    `  echo "${MARKER_PREFIX}active size=$(file_mib)MiB free_disk=$(avail_mib)MiB"`,
    "  exit 0",
    "fi",
    "",
    // Cgroup swap accounting: swapon succeeds but the cgroup never pages out
    // when memory.swap.max is 0. Normally already `max` on Vercel; cheap to assert.
    "echo max | sudo -n tee /sys/fs/cgroup/memory.swap.max >/dev/null 2>&1 || true",
    "",
    // A swapfile baked into the snapshot restores as a plain file with swap
    // off. Reuse it (no new disk cost) unless it breaks the current policy —
    // an oversized leftover is what filled the disk to 100% before.
    'if [ -f "$SWAP" ]; then',
    "  existing=$(file_mib)",
    '  if [ "$existing" -gt "$WANT" ] || [ "$existing" -lt "$MIN" ]; then',
    `    echo "${MARKER_PREFIX}resizing existing=\${existing}MiB want=\${WANT}MiB"`,
    '    sudo -n swapoff "$SWAP" >/dev/null 2>&1 || true',
    '    sudo -n rm -f "$SWAP" || true',
    "  else",
    '    sudo -n chmod 600 "$SWAP" 2>/dev/null || true',
    '    if sudo -n swapon "$SWAP" >/dev/null 2>&1 ||',
    '       { sudo -n mkswap "$SWAP" >/dev/null 2>&1 && sudo -n swapon "$SWAP" >/dev/null 2>&1; }; then',
    `      echo "${MARKER_PREFIX}reused size=\${existing}MiB free_disk=$(avail_mib)MiB"`,
    "      exit 0",
    "    fi",
    `    echo "${MARKER_PREFIX}reuse-failed recreating"`,
    '    sudo -n rm -f "$SWAP" || true',
    "  fi",
    "fi",
    "",
    "AVAIL=$(avail_mib)",
    'if [ -z "${AVAIL:-}" ]; then',
    `  echo "${MARKER_PREFIX}skipped reason=no-df"`,
    "  exit 0",
    "fi",
    "SIZE=$((AVAIL - RESERVE))",
    'if [ "$SIZE" -gt "$WANT" ]; then SIZE=$WANT; fi',
    'if [ "$SIZE" -lt "$MIN" ]; then',
    `  echo "${MARKER_PREFIX}skipped reason=low-disk free_disk=\${AVAIL}MiB reserve=\${RESERVE}MiB min=\${MIN}MiB"`,
    "  exit 0",
    "fi",
    "",
    // fallocate is instant but is rejected on some filesystems (overlay/tmpfs)
    // and by kernels without extent support — dd always works, just slower.
    'if ! sudo -n fallocate -l "${SIZE}M" "$SWAP" >/dev/null 2>&1; then',
    '  sudo -n rm -f "$SWAP" || true',
    '  if ! sudo -n dd if=/dev/zero of="$SWAP" bs=1M count="$SIZE" status=none >/dev/null 2>&1; then',
    '    sudo -n rm -f "$SWAP" || true',
    `    echo "${MARKER_PREFIX}failed stage=allocate fs=$(stat -f -c %T / 2>/dev/null) free_disk=$(avail_mib)MiB"`,
    "    exit 0",
    "  fi",
    "fi",
    'sudo -n chmod 600 "$SWAP" || true',
    'if ! sudo -n mkswap "$SWAP" >/dev/null 2>&1; then',
    '  sudo -n rm -f "$SWAP" || true',
    `  echo "${MARKER_PREFIX}failed stage=mkswap"`,
    "  exit 0",
    "fi",
    'if ! sudo -n swapon "$SWAP" >/dev/null 2>&1; then',
    '  sudo -n rm -f "$SWAP" || true',
    `  echo "${MARKER_PREFIX}failed stage=swapon fs=$(stat -f -c %T / 2>/dev/null)"`,
    "  exit 0",
    "fi",
    // Overflow-only swap: keep hot pages in RAM and page out under real
    // pressure, so steady-state dev-server latency is unchanged.
    "sudo -n sysctl -w vm.swappiness=10 >/dev/null 2>&1 || true",
    `echo "${MARKER_PREFIX}enabled size=\${SIZE}MiB free_disk=$(avail_mib)MiB"`,
    "exit 0",
  ].join("\n");
}

/**
 * Shell script that turns swap off and deletes the swapfile before a snapshot.
 *
 * Without this the swapfile is captured into every stop-snapshot and seeded
 * base image, so each restore starts with ~6 GB of its 32 GB disk already
 * spent on a file the next boot would recreate for free. Skips the swapoff when
 * paging everything back into RAM would itself risk an OOM. Always exits 0 —
 * a leftover swapfile is wasteful, never fatal.
 */
export function buildReleaseSwapScript(): string {
  return [
    "set -u",
    `SWAP=${SWAP_FILE_PATH}`,
    'if ! swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAP"; then',
    '  sudo -n rm -f "$SWAP" >/dev/null 2>&1 || true',
    `  echo "${MARKER_PREFIX}release-noop"`,
    "  exit 0",
    "fi",
    // /proc/swaps reports Size/Used in KiB.
    "USED=$(awk -v f=\"$SWAP\" '$1 == f { print int($4 / 1024) }' /proc/swaps 2>/dev/null)",
    "AVAIL=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null)",
    // swapoff pages everything back into RAM. Leave it alone rather than
    // trigger the very OOM the swapfile exists to prevent.
    'if [ -z "${USED:-}" ] || [ -z "${AVAIL:-}" ] || [ "$USED" -gt "$((AVAIL - 1024))" ]; then',
    `  echo "${MARKER_PREFIX}release-skipped used=\${USED:-?}MiB mem_available=\${AVAIL:-?}MiB"`,
    "  exit 0",
    "fi",
    'if ! sudo -n swapoff "$SWAP" >/dev/null 2>&1; then',
    `  echo "${MARKER_PREFIX}release-failed stage=swapoff used=\${USED}MiB"`,
    "  exit 0",
    "fi",
    'sudo -n rm -f "$SWAP" || true',
    `echo "${MARKER_PREFIX}released"`,
    "exit 0",
  ].join("\n");
}

/**
 * Runs one swap script in the sandbox and returns its status line.
 *
 * Fail-open by design: swap is an optimisation, so every failure degrades to an
 * empty status and a log line rather than breaking a boot or a stop.
 */
async function runSwapScript(
  sandbox: SandboxHandle,
  label: string,
  path: string,
  script: string,
  timeoutSeconds: number,
): Promise<string> {
  try {
    await writeSandboxFile(sandbox, path, script);
    const result = await sandbox.exec(`bash ${path}`, { timeoutSeconds });
    const status =
      result.output
        .split("\n")
        .map((line) => line.trim())
        .findLast((line) => line.startsWith(MARKER_PREFIX)) ??
      `no status (exit ${result.exitCode})`;
    console.log(`[sandbox] ${label}: ${status} on ${sandbox.id}`);
    return status;
  } catch (error) {
    console.log(
      `[sandbox] ${label}: skipped on ${sandbox.id} — ${errorText(error)}`,
    );
    return "";
  }
}

/**
 * Makes swap active in the sandbox before memory-hungry daemons start.
 *
 * Returns the script's status line, or "" when it could not run.
 */
export async function ensureSwapFile(sandbox: SandboxHandle): Promise<string> {
  if (swapProvisioningDisabled()) return "";
  // dd of a multi-GiB file is the slow path (~30-60s on NVMe), still well
  // inside the ~300s single-exec ceiling.
  return await runSwapScript(
    sandbox,
    "ensureSwapFile",
    ENSURE_SCRIPT_PATH,
    buildEnsureSwapScript(resolveSwapConfig()),
    180,
  );
}

/**
 * Drops the swapfile so it is not captured into the sandbox's next snapshot.
 *
 * Call immediately before `stop()`: the next boot recreates swap
 * in a second or two with fallocate, which is far cheaper than carrying the
 * file through every restore. See {@link buildReleaseSwapScript}.
 */
export async function releaseSwapFile(sandbox: SandboxHandle): Promise<string> {
  // Writing pages back to RAM can take a while on a large, well-used swapfile.
  return await runSwapScript(
    sandbox,
    "releaseSwapFile",
    RELEASE_SCRIPT_PATH,
    buildReleaseSwapScript(),
    120,
  );
}
