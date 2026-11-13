import { readFileSync } from "fs";

/**
 * VM memory pressure, sent on the turn heartbeat so the Convex logs (and Axiom)
 * show how close the VM was to running out before it died. Vercel reports a
 * crashed VM only as "stopped", with no reason (session 427, 2026-11-12).
 */
export type VmMemory = {
  memTotalMb: number;
  memAvailableMb: number;
  swapUsedMb: number;
};

/** One sample per window keeps log volume low; heartbeats can fire every second. */
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
    swapUsedMb: Math.round((swapTotal - swapFree) / 1024),
  };
}

/** Adds a memory sample to a heartbeat body, at most once per sample window. */
export function appendVmMemory(body: URLSearchParams, now = Date.now()): void {
  if (now - lastSampleAt < VM_MEMORY_SAMPLE_INTERVAL_MS) return;
  let sample: VmMemory | null = null;
  try {
    sample = parseMeminfo(readFileSync("/proc/meminfo", "utf8"));
  } catch {
    // Not Linux, or /proc unreadable: the heartbeat goes out without it.
    return;
  }
  if (sample === null) return;
  lastSampleAt = now;
  body.set("memTotalMb", String(sample.memTotalMb));
  body.set("memAvailableMb", String(sample.memAvailableMb));
  body.set("swapUsedMb", String(sample.swapUsedMb));
}
