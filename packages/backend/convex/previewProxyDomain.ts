import {
  toProxiedPreviewHost,
  toSandboxHost,
  VERCEL_SANDBOX_HOST_SUFFIX,
} from "@eva/shared/previewHost";

/**
 * Previews are served from `PREVIEW_PROXY_DOMAIN` through the Cloudflare
 * Worker in `apps/preview-proxy` when both env vars are set, so the browser's
 * password manager can match saved logins across previews (see
 * `@eva/shared/previewHost`). Unset, previews stay on `*.vercel.run`.
 * `PREVIEW_PROXY_SECRET` must equal the Worker's secret of the same name.
 */
function readPreviewProxyConfig(): { domain: string; secret: string } | null {
  const domain = process.env.PREVIEW_PROXY_DOMAIN?.trim().toLowerCase();
  const secret = process.env.PREVIEW_PROXY_SECRET;
  if (!domain || !secret) return null;
  return { domain, secret };
}

/** Moves a `*.vercel.run` preview URL onto the proxy domain, when configured. */
export async function toPublicPreviewUrl(url: URL): Promise<URL> {
  const config = readPreviewProxyConfig();
  if (!config) return url;
  const host = await toProxiedPreviewHost(
    url.hostname,
    config.domain,
    config.secret,
  );
  if (!host) return url;
  const proxied = new URL(url);
  proxied.hostname = host;
  return proxied;
}

/**
 * Whether `/preview-auth` may send the browser (and a fresh grant) back to
 * this host: a Vercel sandbox host, or a proxy host Eva signed.
 */
export async function isPreviewReturnHost(hostname: string): Promise<boolean> {
  if (hostname.toLowerCase().endsWith(VERCEL_SANDBOX_HOST_SUFFIX)) return true;
  const config = readPreviewProxyConfig();
  if (!config) return false;
  return (await toSandboxHost(hostname, config.domain, config.secret)) !== null;
}
