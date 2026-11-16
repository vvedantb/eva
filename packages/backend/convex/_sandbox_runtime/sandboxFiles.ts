/**
 * The one way script/file content reaches a sandbox.
 *
 * Deliberately a near-leaf module (its only runtime import is `driveCache.ts`,
 * which imports only the region constant) so every delivery path — including `swap.ts` and
 * `attachments.ts`, which `helpers.ts` imports — can route through it without
 * forming an import cycle.
 */

import type { SandboxHandle } from "../_sandbox/provider";
import { localCachePruneLines } from "../_sandbox/driveCache";
import { errorMessage } from "@vvedantb/server";

/**
 * Linux caps a single `execve` argument at MAX_ARG_STRLEN — 128 KB, and not
 * tunable. Every sandbox command ships as one `bash -lc '<payload>'` argument,
 * so anything interpolated into a command shares that one budget.
 *
 * The preview proxy script crossed it when the vendored html2canvas bundle
 * (~200 KB) was piped through a heredoc: every launch died with "failed to
 * start process: fork/exec /usr/bin/bash: argument list too long", surfacing as
 * "preview proxy failed to start on port 3000" and naming no cause.
 *
 * This ceiling sits far under 128 KB on purpose. Content anywhere near the real
 * limit belongs in a file, not an argument; the margin leaves room for the shell
 * wrapper, the env preamble, and the rest of the command.
 */
export const MAX_INLINE_EXEC_CONTENT_BYTES = 8 * 1024;

/**
 * Swapfile location. On `/`, which is a real fs (fallocate-capable). Lives here,
 * not in `swap.ts`, because the disk reclaim below must know it and `swap.ts`
 * already imports this module.
 */
export const SWAP_FILE_PATH = "/swapfile";

/**
 * Vercel `writeFiles` uploads a tarball and extracts it inside the VM. When the
 * disk (or its inodes) is full the extract fails and the API answers only
 * `400 The submitted tarball could not be extracted` — no ENOSPC in sight.
 * Prod 2026-11-09: every resume write on one sandbox failed this way, while an
 * exec on the same VM reported `No space left on device`.
 */
const TARBALL_EXTRACT_FAILED = "tarball could not be extracted";

/** Below this much free disk (MiB) or inodes we call the disk full. */
const DISK_FULL_FREE_MIB = 256;
const DISK_FULL_FREE_INODES = 1000;

const DISK_MARKER = "eva-disk:";

/**
 * Below this much free disk (MiB), boot and reclaim delete Eva-owned data that
 * can be rebuilt. Above it the caches stay, because they keep installs warm.
 * Session 96's sandbox ran a week near 1.4 GB free (2026-11-04 to 11), then
 * a merge and reinstall filled it and the agent daemon failed with ENOSPC.
 */
export const LOW_DISK_CLEANUP_MIB = 2048;

/** Eva-owned logs in /tmp. Emptied (not deleted: writers hold them open) past 64 MiB. */
const EVA_TMP_LOGS = [
  "bg-*.log",
  "eva-*.log",
  "callback-debug.log",
  "run-design.raw.jsonl",
  "seedrun.log",
  "seed-install.log",
];

/**
 * Shell that frees Eva-owned, rebuildable disk when free space is below
 * {@link LOW_DISK_CLEANUP_MIB}: package caches ({@link localCachePruneLines})
 * and oversized Eva logs. `freeMibFn` names a shell function, defined by the
 * caller, that prints free MiB on `/`. Sets `CLEANED=yes` when it ran.
 *
 * Never touches the repo, build output, node_modules or local database data:
 * a dev server may be running on them, and they are the user's work.
 */
export function lowDiskCleanupLines(freeMibFn: string): string[] {
  const names = EVA_TMP_LOGS.map((name) => `-name '${name}'`).join(" -o ");
  return [
    "CLEANED=no",
    `if [ "$(${freeMibFn})" -lt ${LOW_DISK_CLEANUP_MIB} ] 2>/dev/null; then`,
    ...localCachePruneLines(),
    `  sudo find /tmp -maxdepth 1 -type f \\( ${names} \\) -size +64M -exec truncate -s 0 {} + 2>/dev/null || true`,
    "  CLEANED=yes",
    "fi",
  ];
}

/** What a user can do about a full disk. One text for every place that reports it. */
export const SANDBOX_DISK_FULL_ADVICE =
  "Free space in the sandbox (for example build output, logs or local database data) and start it again.";

/** True for an error text that comes from a full disk (Node's ENOSPC or the kernel's wording). */
export function isDiskFullErrorText(text: string): boolean {
  return /\bENOSPC\b|no space left on device/i.test(text);
}

/** A file write failed because the sandbox disk is full; reclaim did not help. */
export class SandboxDiskFullError extends Error {
  readonly freeMib: number;
  readonly freeInodes: number;

  constructor(
    path: string,
    disk: { freeMib: number; freeInodes: number },
    cause: unknown,
  ) {
    super(
      `Sandbox disk is full (free=${disk.freeMib}MiB, free_inodes=${disk.freeInodes}): could not write ${path}. ${SANDBOX_DISK_FULL_ADVICE}`,
      { cause },
    );
    this.name = "SandboxDiskFullError";
    this.freeMib = disk.freeMib;
    this.freeInodes = disk.freeInodes;
  }
}

/** True for the provider's opaque "extract failed" answer to a file write. */
export function isTarballExtractError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(TARBALL_EXTRACT_FAILED)
  );
}

/**
 * Shell script that frees the disk space eva itself owns, then reports what is
 * free. Runs as one small inline exec, because a full disk cannot take the
 * file write a script would normally need.
 *
 * An INACTIVE swapfile is deleted first. It is eva's own artifact: a stop that
 * could not release swap bakes it into the snapshot, where it restores as a
 * plain ~6 GB file. `ensureSwapFile` recreates it within its disk reserve.
 * If space is still low, {@link lowDiskCleanupLines} drops Eva's package
 * caches and oversized logs. User data is never touched.
 */
export function buildReclaimDiskScript(): string {
  return [
    "set -u",
    `SWAP=${SWAP_FILE_PATH}`,
    "free_mib() { df -Pm / 2>/dev/null | awk 'NR==2 {print $4}'; }",
    "free_inodes() { df -Pi / 2>/dev/null | awk 'NR==2 {print $4}'; }",
    "BEFORE=$(free_mib)",
    "SWAPFILE=none",
    'if [ -f "$SWAP" ]; then',
    '  if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAP"; then',
    "    SWAPFILE=active",
    "  else",
    '    sudo -n rm -f "$SWAP" >/dev/null 2>&1 || rm -f "$SWAP" >/dev/null 2>&1 || true',
    '    if [ -f "$SWAP" ]; then SWAPFILE=remove-failed; else SWAPFILE=removed; fi',
    "  fi",
    "fi",
    ...lowDiskCleanupLines("free_mib"),
    `echo "${DISK_MARKER} before_mib=\${BEFORE:--1} free_mib=$(free_mib) free_inodes=$(free_inodes) swapfile=\${SWAPFILE} cleaned=\${CLEANED}"`,
    "exit 0",
  ].join("\n");
}

export type DiskReclaimReport = {
  freeMib: number;
  freeInodes: number;
  /** The script's status line, for logs. */
  status: string;
};

/** Parses the reclaim script's status line. Unknown numbers become -1. */
export function parseReclaimDiskOutput(output: string): DiskReclaimReport {
  const status =
    output
      .split("\n")
      .map((line) => line.trim())
      .findLast((line) => line.startsWith(DISK_MARKER)) ?? "";
  const field = (name: string): number => {
    const match = status.match(new RegExp(`\\b${name}=(\\d+)`));
    return match ? Number(match[1]) : -1;
  };
  return {
    freeMib: field("free_mib"),
    freeInodes: field("free_inodes"),
    status,
  };
}

/** True when the report proves the disk (or its inode table) is full. */
export function isDiskFull(report: DiskReclaimReport): boolean {
  return (
    (report.freeMib >= 0 && report.freeMib < DISK_FULL_FREE_MIB) ||
    (report.freeInodes >= 0 && report.freeInodes < DISK_FULL_FREE_INODES)
  );
}

/** Frees eva-owned disk space. Fail-open: returns null when it could not run. */
async function reclaimSandboxDisk(
  sandbox: SandboxHandle,
): Promise<DiskReclaimReport | null> {
  try {
    const result = await sandbox.exec(buildReclaimDiskScript(), {
      cwd: "/",
      timeoutSeconds: 30,
    });
    const report = parseReclaimDiskOutput(result.output);
    console.log(
      `[sandbox] reclaimSandboxDisk on ${sandbox.id}: ${report.status || `no status (exit ${result.exitCode})`}`,
    );
    return report;
  } catch (error) {
    console.log(
      `[sandbox] reclaimSandboxDisk skipped on ${sandbox.id}: ${errorMessage(error)}`,
    );
    return null;
  }
}

/**
 * Delivers content into the sandbox filesystem.
 *
 * Built on `writeFile` (Vercel `writeFiles`), which has no argument-length
 * limit — the ~330 KB callback runner ships this way. Use this instead of
 * `cat > file <<'EOF'`, `echo <base64> | base64 -d > file`, or `printf` into a
 * file: those put the whole payload into one exec argument and fail hard once
 * it grows, usually long after whoever grew it has moved on.
 *
 * Self-heals a full disk: on the provider's opaque extract failure it frees
 * eva-owned space ({@link buildReclaimDiskScript}) and retries once. If the
 * disk is still full, it throws {@link SandboxDiskFullError}, which names the
 * cause instead of "tarball could not be extracted".
 *
 * `executable` chmods in a separate, tiny exec — only the path is interpolated,
 * never the content.
 */
export async function writeSandboxFile(
  sandbox: SandboxHandle,
  path: string,
  content: string | Uint8Array,
  opts: { executable?: boolean } = {},
): Promise<void> {
  try {
    await sandbox.writeFile(path, content);
  } catch (error) {
    if (!isTarballExtractError(error)) throw error;
    const report = await reclaimSandboxDisk(sandbox);
    try {
      await sandbox.writeFile(path, content);
    } catch (retryError) {
      if (report && isDiskFull(report)) {
        throw new SandboxDiskFullError(path, report, retryError);
      }
      throw retryError;
    }
  }
  if (opts.executable) {
    await sandbox.exec(`chmod +x ${JSON.stringify(path)}`, {
      timeoutSeconds: 10,
    });
  }
}
