import { readFileSync } from "fs";

/**
 * VM memory pressure, sent on the turn heartbeat so the Convex logs (and Axiom)
 * show how close the VM was to running out before it died. Vercel reports a
 * crashed VM only as "stopped", with no reason (session 427, 2026-11-12).
 */
export type VmMemory = {
  memTotalMb: number;
  memAvailableMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
};

const VM_MEMORY_SAMPLE_INTERVAL_MS = 30_000;
let lastSampleAt = 0;

/** Parses the kB fields of `/proc/meminfo` into whole MB. Null if a field is missing. */
export function parseMeminfo(text: string): VmMemory | null {
  const kb = (key: string): number | null => {
    const match = new RegExp(`^${key}:\\s+(\\d+) kB$`, "m").exec(text);
    return match ? Number(match[1]) : null;
  };
  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  const swapTotal = kb("SwapTotal");
  const swapFree = kb("SwapFree");
  if (
    total === null ||
    available === null ||
    swapTotal === null ||
    swapFree === null
  ) {
    return null;
  }
  return {
    memTotalMb: Math.round(total / 1024),
    memAvailableMb: Math.round(available / 1024),
    swapTotalMb: Math.round(swapTotal / 1024),
    swapUsedMb: Math.round((swapTotal - swapFree) / 1024),
  };
}

/**
 * Kernel OOM kills since boot (`oom_kill` in `/proc/vmstat`). A rise between
 * two heartbeats proves the kernel killed something. The watchdog's own
 * post-mortem exec cannot prove it: under swap thrash that exec times out
 * too (session 1054, 2026-11-26).
 */
export function parseOomKills(vmstat: string): number | null {
  const match = /^oom_kill (\d+)$/m.exec(vmstat);
  return match ? Number(match[1]) : null;
}

function readVmMemory(): VmMemory | null {
  try {
    return parseMeminfo(readFileSync("/proc/meminfo", "utf8"));
  } catch {
    return null;
  }
}

function readOomKills(): number | null {
  try {
    return parseOomKills(readFileSync("/proc/vmstat", "utf8"));
  } catch {
    return null;
  }
}

/** Adds a memory sample to a heartbeat body, at most once per sample window. */
export function appendVmMemory(body: URLSearchParams, now = Date.now()): void {
  if (now - lastSampleAt < VM_MEMORY_SAMPLE_INTERVAL_MS) return;
  const sample = readVmMemory();
  if (sample === null) return;
  lastSampleAt = now;
  body.set("memTotalMb", String(sample.memTotalMb));
  body.set("memAvailableMb", String(sample.memAvailableMb));
  body.set("swapUsedMb", String(sample.swapUsedMb));
  const oomKills = readOomKills();
  if (oomKills !== null) body.set("oomKills", String(oomKills));
}

const LOW_MEMORY_AVAILABLE_MB = 1024;

/**
 * True when the VM is close to an OOM kill or a swap freeze: little free RAM,
 * or more than half the swap already used. Swap use alone matters because the
 * dev server and Convex backend can hold free RAM steady while swap fills.
 */
export function isLowMemory(sample: VmMemory): boolean {
  return (
    sample.memAvailableMb < LOW_MEMORY_AVAILABLE_MB ||
    (sample.swapTotalMb > 0 && sample.swapUsedMb * 2 > sample.swapTotalMb)
  );
}

/**
 * Note for the agent before a shell command when the VM is low on memory, or
 * null when it is not. Advice only: the command still runs.
 */
export function lowMemoryNotice(
  sample: VmMemory | null = readVmMemory(),
): string | null {
  if (sample === null || !isLowMemory(sample)) return null;
  return [
    `Eva: this sandbox is low on memory (${sample.memAvailableMb} MB RAM free, ${sample.swapUsedMb} of ${sample.swapTotalMb} MB swap used).`,
    "A memory-heavy command now can freeze the VM and end this turn.",
    "Avoid full-repo type checks, builds and test suites; check one package or file instead.",
    "Never start a second dev server.",
  ].join(" ");
}
