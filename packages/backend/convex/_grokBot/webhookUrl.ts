const WEBHOOK_HOST = "api2.cursor.sh";
const WEBHOOK_PATH_PREFIX = "/automations/webhook/";

/**
 * Accepts only Cursor Grok Bot routine webhooks.
 * Rejects other hosts, http, credentials, ports, query, and hash so a stored
 * URL cannot be used as SSRF.
 */
export function parseGrokBotWebhookUrl(raw: string): string | null {
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.hostname !== WEBHOOK_HOST) return null;
  if (parsed.port !== "") return null;
  if (!parsed.pathname.startsWith(WEBHOOK_PATH_PREFIX)) return null;
  const id = parsed.pathname.slice(WEBHOOK_PATH_PREFIX.length);
  if (id.includes("/")) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  if (id.length < 8 || id.length > 128) return null;
  if (parsed.search !== "" || parsed.hash !== "") return null;
  return `https://${WEBHOOK_HOST}${WEBHOOK_PATH_PREFIX}${id}`;
}

/** Strips a leading `Bearer ` if the user pasted the full header. */
export function normalizeGrokBotWebhookKey(raw: string): string | null {
  let trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    trimmed = trimmed.slice(7).trim();
  }
  if (trimmed.length < 8 || trimmed.length > 512) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}
