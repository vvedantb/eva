/**
 * Preview hostnames on a domain Eva owns, fronted by the Cloudflare Worker in
 * `apps/preview-proxy`.
 *
 * Vercel serves each sandbox port at `<label>.vercel.run`, and `vercel.run` is
 * on the Public Suffix List, so every preview is its own registrable domain and
 * the browser's password manager never offers a password saved on another one.
 * Serving previews as `<label>-<sig>.<domain>` puts them all under one
 * registrable domain, so a password saved on any preview is suggested on all.
 *
 * The signature stops the Worker being an open proxy for every Vercel sandbox:
 * without it anyone's `*.vercel.run` sandbox could be served on our domain and
 * be offered the saved preview password. Only hosts Eva minted verify.
 *
 * Pure WebCrypto, no imports: the same code runs in Convex and in the Worker.
 */
export const VERCEL_SANDBOX_HOST_SUFFIX = ".vercel.run";

/** Hex chars of HMAC-SHA256 kept in the hostname (64 bits). */
const SIGNATURE_LENGTH = 16;
const DNS_LABEL_MAX_LENGTH = 63;
const SANDBOX_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

async function signLabel(label: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(label)),
  );
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, SIGNATURE_LENGTH);
}

function equalInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * `abc-3000.vercel.run` → `abc-3000-<sig>.<domain>`. Null when the host is not
 * a single-label Vercel sandbox host or the signed label would not fit in DNS;
 * callers then keep the original `*.vercel.run` URL.
 */
export async function toProxiedPreviewHost(
  sandboxHost: string,
  domain: string,
  secret: string,
): Promise<string | null> {
  const host = sandboxHost.toLowerCase();
  if (!host.endsWith(VERCEL_SANDBOX_HOST_SUFFIX)) return null;
  const label = host.slice(0, -VERCEL_SANDBOX_HOST_SUFFIX.length);
  if (!SANDBOX_LABEL_RE.test(label)) return null;
  const signed = `${label}-${await signLabel(label, secret)}`;
  if (signed.length > DNS_LABEL_MAX_LENGTH) return null;
  return `${signed}.${domain.toLowerCase()}`;
}

/**
 * `abc-3000-<sig>.<domain>` → `abc-3000.vercel.run`. Null for anything Eva did
 * not mint: another domain, nested subdomains, or a bad signature.
 */
export async function toSandboxHost(
  proxiedHost: string,
  domain: string,
  secret: string,
): Promise<string | null> {
  const host = proxiedHost.toLowerCase();
  const suffix = `.${domain.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const signed = host.slice(0, -suffix.length);
  const separator = signed.length - SIGNATURE_LENGTH - 1;
  if (separator < 1 || signed[separator] !== "-") return null;
  const label = signed.slice(0, separator);
  if (!SANDBOX_LABEL_RE.test(label)) return null;
  const expected = await signLabel(label, secret);
  if (!equalInConstantTime(signed.slice(separator + 1), expected)) return null;
  return `${label}${VERCEL_SANDBOX_HOST_SUFFIX}`;
}
