// Bundled by wrangler; a relative import keeps this Worker out of the pnpm
// workspace (no package.json, no lockfile entry) while sharing the exact
// signing code Convex uses to mint preview hosts.
import { toSandboxHost } from "../../../packages/shared/src/previewHost";

/**
 * Serves `<label>-<sig>.<domain>` from the Eva sandbox at `<label>.vercel.run`.
 *
 * Exists only so previews share one registrable domain — `vercel.run` is a
 * public suffix, so the browser's password manager treats every sandbox host
 * as a new site. Everything else (auth gate, cookies, HTML injection) stays in
 * the in-sandbox preview proxy; this is a transparent pipe.
 */
interface Env {
  PREVIEW_PROXY_DOMAIN: string;
  PREVIEW_PROXY_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const sandboxHost = await toSandboxHost(
      url.hostname,
      env.PREVIEW_PROXY_DOMAIN,
      env.PREVIEW_PROXY_SECRET,
    );
    // Unsigned hosts would make this an open proxy for every Vercel sandbox.
    if (!sandboxHost) return new Response("Unknown preview", { status: 404 });

    const upstreamUrl = new URL(
      url.pathname + url.search,
      `https://${sandboxHost}`,
    );
    // Copies method, headers (incl. cookies and Upgrade) and body; the runtime
    // sets Host from the URL, which Vercel's edge needs to find the sandbox.
    const response = await fetch(new Request(upstreamUrl, request), {
      redirect: "manual",
    });

    // A WebSocket handshake comes back as a 101 carrying the upstream socket;
    // returning it unchanged splices the two connections together.
    if (response.status === 101) return response;
    return rewriteLocation(response, sandboxHost, url.host);
  },
};

/**
 * Keeps redirects on our domain. The in-sandbox proxy already turns absolute
 * `*.vercel.run` Locations into path-only ones; this covers anything that slips
 * past it. Only the same sandbox host is mapped — never another one.
 */
function rewriteLocation(
  response: Response,
  sandboxHost: string,
  publicHost: string,
): Response {
  const location = response.headers.get("location");
  if (!location) return response;
  let target: URL;
  try {
    target = new URL(location);
  } catch {
    return response;
  }
  if (target.host !== sandboxHost) return response;
  target.host = publicHost;
  const headers = new Headers(response.headers);
  headers.set("location", target.toString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
