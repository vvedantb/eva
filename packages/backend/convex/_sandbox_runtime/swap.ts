import type { SandboxHandle } from "../_sandbox/provider";
import {
  lowDiskCleanupLines,
  SWAP_FILE_PATH,
  writeSandboxFile,
} from "./sandboxFiles";
import { errorMessage } from "@vvedantb/server";

const ENSURE_SCRIPT_PATH = "/tmp/eva-ensure-swap.sh";
const RELEASE_SCRIPT_PATH = "/tmp/eva-release-swap.sh";

const MARKER_PREFIX = "eva-swap:";

export type SwapConfig = {
  sizeMib: number;
  reserveMib: number;
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
    "DISK_BEFORE=$(avail_mib)",
    ...lowDiskCleanupLines("avail_mib"),
    'if [ "$CLEANED" = yes ]; then',
    `  echo "${MARKER_PREFIX}low-disk-cleanup before=\${DISK_BEFORE}MiB after=$(avail_mib)MiB"`,
    "fi",
    "",
    'if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAP"; then',
    `  echo "${MARKER_PREFIX}active size=$(file_mib)MiB free_disk=$(avail_mib)MiB"`,
    "  exit 0",
    "fi",
    "",
    "echo max | sudo -n tee /sys/fs/cgroup/memory.swap.max >/dev/null 2>&1 || true",
    "",
    'if [ -f "$SWAP" ]; then',
    "  existing=$(file_mib)",
    "  free_now=$(avail_mib)",
    '  if [ "$existing" -gt "$WANT" ] || [ "$existing" -lt "$MIN" ] || [ "${free_now:-$RESERVE}" -lt "$RESERVE" ]; then',
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
    "USED=$(awk -v f=\"$SWAP\" '$1 == f { print int($4 / 1024) }' /proc/swaps 2>/dev/null)",
    "AVAIL=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null)",
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
    const markers = result.output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith(MARKER_PREFIX));
    const status = markers.at(-1) ?? `no status (exit ${result.exitCode})`;
    const logged = markers.length > 1 ? markers.join(" | ") : status;
    console.log(`[sandbox] ${label}: ${logged} on ${sandbox.id}`);
    return status;
  } catch (error) {
    console.log(
      `[sandbox] ${label}: skipped on ${sandbox.id} — ${errorMessage(error)}`,
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
 * Call immediately before `stop()` / `archive()`: the next boot recreates swap
 * in a second or two with fallocate, which is far cheaper than carrying the
 * file through every restore. See {@link buildReleaseSwapScript}.
 */
export async function releaseSwapFile(sandbox: SandboxHandle): Promise<string> {
  return await runSwapScript(
    sandbox,
    "releaseSwapFile",
    RELEASE_SCRIPT_PATH,
    buildReleaseSwapScript(),
    120,
  );
}
