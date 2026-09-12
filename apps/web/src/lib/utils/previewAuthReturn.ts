const VERCEL_PREVIEW_SUFFIX = ".vercel.run";

/**
 * Open-redirect guard for /preview-auth. The grant is minted for
 * `sandboxId`+`port`, so the bounce-back host must be that sandbox's
 * Vercel preview origin — not any other `*.vercel.run` host.
 */
export function parseAllowedReturn(
  url: string,
  sandboxId: string,
  port: number,
): URL | null {
  if (!sandboxId || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname.endsWith(VERCEL_PREVIEW_SUFFIX)) return null;
    const expected = `${sandboxId}-${port}${VERCEL_PREVIEW_SUFFIX}`.toLowerCase();
    if (parsed.hostname.toLowerCase() !== expected) return null;
    return parsed;
  } catch {
    return null;
  }
}
