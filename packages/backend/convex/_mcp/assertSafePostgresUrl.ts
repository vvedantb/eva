import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True when a resolved address is loopback, link-local, RFC1918, or CGNAT. */
export function isBlockedResolvedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return isBlockedResolvedAddress(mapped[1]);

  const parts = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address);
  if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  return false;
}

export function assertSafePostgresUrlShape(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Postgres URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Postgres URL must use postgres://");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Postgres URL host is not allowed");
  }
  if (isIP(host) && isBlockedResolvedAddress(host)) {
    throw new Error("Postgres URL host is not allowed");
  }
  return parsed;
}

/**
 * Rejects private / metadata hosts, including DNS that resolves to them
 * (127.1, nip.io, IPv4-mapped IPv6). Fail-closed when DNS does not resolve.
 */
export async function assertSafePostgresUrl(url: string): Promise<void> {
  const parsed = assertSafePostgresUrlShape(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error("Postgres URL host is not allowed");
  }
  if (
    records.length === 0 ||
    records.some((record) => isBlockedResolvedAddress(record.address))
  ) {
    throw new Error("Postgres URL host is not allowed");
  }
}
