"use node";

import type { JWK } from "jose";
import type { SandboxHandle } from "../_sandbox/provider";
import { execHandle } from "./helpers";
import { writeSandboxFile } from "./sandboxFiles";
import {
  PREVIEW_GRANT_AUDIENCE,
  PREVIEW_GRANT_ISSUER,
  PREVIEW_GRANT_PARAM,
  PREVIEW_SESSION_COOKIE,
  PREVIEW_SESSION_TTL_SECONDS,
} from "../previewGrantConfig";
import { PREVIEW_ANNOTATION_SCRIPT } from "./previewAnnotationScript.generated";
import { PREVIEW_HTML2CANVAS_SCRIPT } from "./html2canvasScript.generated";
import { VERCEL_PREVIEW_PROXY_PORT } from "./vercelAppPorts";

export { VERCEL_PREVIEW_PROXY_PORT };

// Internal port range the injected navigation proxy listens on.
const PROXY_PORT_MIN = 9000;
const PROXY_PORT_MAX = 9999;
const PROXY_PORT_COUNT = PROXY_PORT_MAX - PROXY_PORT_MIN + 1;
/** noVNC/websockify listens here; auth proxy owns exposed 6080. */
export const VERCEL_DESKTOP_INTERNAL_PORT = 16080;
/** code-server listens here; auth proxy owns exposed 8080. */
export const VERCEL_EDITOR_INTERNAL_PORT = 18080;
const HEALTH_PATH = "/__eva_preview_proxy/health";
// Bump when the generated proxy script changes so already-running proxies from
// an older deploy are detected as stale (via the health response) and relaunched.
const SCRIPT_VERSION = "stream-v19";

/** Values injected into the generated proxy script to drive the auth gate. */
interface PreviewProxyAuthParams {
  /** Public half of the preview-grant keypair, or null to disable gating. */
  publicKeyJwk: JWK | null;
  sandboxId: string;
  repoId: string;
  /** Eva origin to redirect cold loads to for sign-in (e.g. WEB_APP_URL). */
  webAppUrl: string;
  /** Whether to inject the navigation-sync script into HTML responses. */
  inject: boolean;
  /**
   * Port advertised in preview-auth redirects / grant claims. Defaults to the
   * upstream targetPort. On Vercel, desktop/editor listen internally
   * (16080/18080) while the browser hits the exposed proxy port (6080/8080) —
   * pass the exposed port here so grants and /preview-auth stay aligned.
   */
  authPort?: number;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function previewProxyPortCandidates(targetPort: number): number[] {
  const start = PROXY_PORT_MIN + (targetPort % PROXY_PORT_COUNT);
  const candidates: number[] = [];

  for (let offset = 0; offset < PROXY_PORT_COUNT; offset += 1) {
    const candidate =
      PROXY_PORT_MIN + ((start - PROXY_PORT_MIN + offset) % PROXY_PORT_COUNT);
    if (candidate !== targetPort) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

async function listListeningPorts(
  sandbox: SandboxHandle,
): Promise<Set<number>> {
  const ports = new Set<number>();
  try {
    const output = await execHandle(
      sandbox,
      "(ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null || true) | awk '{print $4}'",
      5,
      "/tmp",
    );
    for (const line of output.split(/\r?\n/)) {
      const match = line.trim().match(/:(\d+)$/);
      if (!match?.[1]) continue;

      const port = Number(match[1]);
      if (isPort(port)) {
        ports.add(port);
      }
    }
  } catch {
    return ports;
  }
  return ports;
}

async function resolvePreviewProxyPort(
  sandbox: SandboxHandle,
  targetPort: number,
  fixedProxyPort?: number,
): Promise<number> {
  if (fixedProxyPort !== undefined) {
    if (!isPort(fixedProxyPort) || fixedProxyPort === targetPort) {
      throw new Error(`Invalid fixed preview proxy port: ${fixedProxyPort}`);
    }
    return fixedProxyPort;
  }

  const candidates = previewProxyPortCandidates(targetPort);
  const listeningPorts = await listListeningPorts(sandbox);

  for (const candidate of candidates) {
    if (!listeningPorts.has(candidate)) continue;
    if (await proxyAlreadyRunning(sandbox, targetPort, candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (!listeningPorts.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No available preview proxy port in ${PROXY_PORT_MIN}-${PROXY_PORT_MAX}`,
  );
}

function buildPreviewProxyScript(params: PreviewProxyAuthParams): string {
  return String.raw`
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";

// The proxy runs detached with no supervisor: one uncaught throw (a socket
// error event with no listener, say) would kill it and take the preview down
// until something relaunches it. Log and keep serving instead.
process.on("uncaughtException", (err) => {
  console.error("Eva preview proxy: uncaught exception", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Eva preview proxy: unhandled rejection", err);
});

const targetPort = Number(process.env.EVA_PREVIEW_TARGET_PORT || "0");
const proxyPort = Number(process.env.EVA_PREVIEW_PROXY_PORT || "0");
const healthPath = "/__eva_preview_proxy/health";
const html2canvasPath = "/__eva_preview_proxy/html2canvas.js";
const HTML2CANVAS_SCRIPT = ${JSON.stringify(PREVIEW_HTML2CANVAS_SCRIPT).replace(/`/g, "\\`")};

if (!Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) {
  throw new Error("Invalid EVA_PREVIEW_TARGET_PORT");
}

if (!Number.isInteger(proxyPort) || proxyPort <= 0 || proxyPort > 65535) {
  throw new Error("Invalid EVA_PREVIEW_PROXY_PORT");
}

// ---------------------------------------------------------------------------
// Auth gate. These constants are interpolated by the Convex-side builder. When
// no public key is configured GATE_ENABLED is false and the proxy behaves as
// the original pass-through (legacy mode), so previews keep working until the
// PREVIEW_GRANT_PRIVATE_KEY + WEB_APP_URL env vars are set.
// ---------------------------------------------------------------------------
const PUBLIC_KEY_JWK = ${params.publicKeyJwk ? JSON.stringify(params.publicKeyJwk) : "null"};
const SANDBOX_ID = ${JSON.stringify(params.sandboxId)};
const REPO_ID = ${JSON.stringify(params.repoId)};
const WEB_APP_URL = ${JSON.stringify(params.webAppUrl)};
const EXPECTED_ISS = ${JSON.stringify(PREVIEW_GRANT_ISSUER)};
const EXPECTED_AUD = ${JSON.stringify(PREVIEW_GRANT_AUDIENCE)};
const SESSION_COOKIE = ${JSON.stringify(PREVIEW_SESSION_COOKIE)};
const GRANT_PARAM = ${JSON.stringify(PREVIEW_GRANT_PARAM)};
const SESSION_TTL_SECONDS = ${PREVIEW_SESSION_TTL_SECONDS};
const INJECT_ENABLED = ${params.inject ? "true" : "false"};
const SCRIPT_VERSION = ${JSON.stringify(SCRIPT_VERSION)};
const GATE_ENABLED = PUBLIC_KEY_JWK !== null && WEB_APP_URL.length > 0;
// Port shown to /preview-auth and matched against grant claims. May differ from
// targetPort when the proxy fronts an internal-only upstream (Vercel desktop).
const AUTH_PORT = ${params.authPort ?? "targetPort"};
// Desktop (noVNC) and editor (code-server) HTML needs whole-document rewrites;
// dev-server HTML is streamed with head-only injection so upstream streaming
// (e.g. Next.js partial prerendering) reaches the browser incrementally.
const BUFFER_WHOLE_HTML =
  targetPort === ${VERCEL_DESKTOP_INTERNAL_PORT} ||
  targetPort === ${VERCEL_EDITOR_INTERNAL_PORT};

let PUBLIC_KEY = null;
if (GATE_ENABLED) {
  try {
    PUBLIC_KEY = crypto.createPublicKey({ key: PUBLIC_KEY_JWK, format: "jwk" });
  } catch (e) {
    console.error("Eva preview proxy: invalid grant public key", e);
  }
}
// Random per-process secret for the proxy's own session cookie. The proxy only
// holds the grant's public key (cannot mint long-lived grants), so it exchanges
// a validated short-lived grant for an HMAC session cookie it can verify itself.
// A proxy restart invalidates sessions, which just forces a fast re-auth.
const SESSION_SECRET = crypto.randomBytes(32);

function b64urlToBuf(s) {
  let v = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (v.length % 4) v += "=";
  return Buffer.from(v, "base64");
}

function bufToB64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (!k) continue;
    out[k] = part.slice(idx + 1).trim();
  }
  return out;
}

// Verifies an ES256 grant JWT. JOSE signatures are raw r||s (IEEE P-1363), not
// the DER form node:crypto defaults to, hence dsaEncoding.
function verifyGrant(token) {
  if (!PUBLIC_KEY) return null;
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const signingInput = Buffer.from(parts[0] + "." + parts[1]);
    const ok = crypto.verify(
      "sha256",
      signingInput,
      { key: PUBLIC_KEY, dsaEncoding: "ieee-p1363" },
      b64urlToBuf(parts[2]),
    );
    if (!ok) return null;
    const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (payload.iss !== EXPECTED_ISS) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (aud.indexOf(EXPECTED_AUD) === -1) return null;
    if (payload.sandboxId !== SANDBOX_ID) return null;
    return payload;
  } catch {
    return null;
  }
}

function signSession(payload) {
  const body = bufToB64url(Buffer.from(JSON.stringify(payload)));
  const mac = bufToB64url(
    crypto.createHmac("sha256", SESSION_SECRET).update(body).digest(),
  );
  return body + "." + mac;
}

function verifySession(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 2) return null;
    const expected = bufToB64url(
      crypto.createHmac("sha256", SESSION_SECRET).update(parts[0]).digest(),
    );
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlToBuf(parts[0]).toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (payload.sandboxId !== SANDBOX_ID) return null;
    return payload;
  } catch {
    return null;
  }
}

// HTML interstitial for unauthenticated document loads. Vercel terminates TLS
// at its edge and exposes each port on its own subdomain before this process
// ever sees the request, so the proxy cannot know its own browser-facing URL.
// We therefore compute the return URL in the browser from location.href, which
// is the real external preview origin, and embed the server-known port + ids.
function buildAuthBootstrapHtml() {
  const base =
    WEB_APP_URL +
    "/preview-auth?sandbox=" + encodeURIComponent(SANDBOX_ID) +
    "&repo=" + encodeURIComponent(REPO_ID) +
    "&port=" + encodeURIComponent(String(AUTH_PORT)) +
    "&return=";
  const inline =
    "var u=new URL(location.href);" +
    "u.searchParams.delete(" + JSON.stringify(GRANT_PARAM) + ");" +
    "location.replace(" + JSON.stringify(base) +
    "+encodeURIComponent(u.toString()));";
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    "<title>Sign in to preview</title>" +
    "<script>" + inline + "</scr" + "ipt></head>" +
    "<body><noscript>Open this preview from Eva to sign in.</noscript>" +
    "</body></html>"
  );
}

// noVNC's vnc_lite.html loads RFB via <script type="module" crossorigin="anonymous">,
// which intentionally omits cookies on ./core/rfb.js. Without an exception those
// module fetches 401 and the page never leaves the default "Loading" status.
// Static assets are public open-source files; HTML documents and WebSockets stay gated.
const STATIC_ASSET_RE =
  /\.(?:js|mjs|cjs|css|map|svg|png|jpe?g|gif|ico|webp|woff2?|ttf|otf|wasm)(?:\?|$)/i;

// Returns true if the request is authorized and may proceed. Returns false when
// it has already written a response (cookie-set redirect, login redirect, 401).
function isLoopbackRequest(req) {
  const addr = req.socket && req.socket.remoteAddress;
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

function authorize(clientReq, clientRes) {
  if (!GATE_ENABLED) return true;
  // In-sandbox clients (Inngest, BASE_APP_URL, agent-browser) hit the proxy on
  // exposed 3000 via localhost — must not require a preview grant.
  if (isLoopbackRequest(clientReq)) return true;

  let parsed = null;
  try {
    parsed = new URL(
      clientReq.url || "/",
      "https://" + (clientReq.headers["host"] || "127.0.0.1"),
    );
  } catch {}

  const isGet = (clientReq.method || "GET").toUpperCase() === "GET";
  if (isGet && parsed && STATIC_ASSET_RE.test(parsed.pathname)) {
    return true;
  }

  const cookies = parseCookies(clientReq.headers["cookie"]);
  const session = cookies[SESSION_COOKIE];
  if (session && verifySession(session)) return true;

  const grant = parsed ? parsed.searchParams.get(GRANT_PARAM) : null;
  if (grant) {
    const claims = verifyGrant(grant);
    if (claims && parsed) {
      const now = Math.floor(Date.now() / 1000);
      const token = signSession({
        sandboxId: SANDBOX_ID,
        sub: typeof claims.sub === "string" ? claims.sub : "",
        exp: now + SESSION_TTL_SECONDS,
      });
      parsed.searchParams.delete(GRANT_PARAM);
      const cleanPath = parsed.pathname + parsed.search + parsed.hash;
      const cookie =
        SESSION_COOKIE + "=" + token +
        "; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=" +
        String(SESSION_TTL_SECONDS);
      clientRes.writeHead(302, {
        location: cleanPath,
        "set-cookie": cookie,
        "referrer-policy": "no-referrer",
        "cache-control": "no-store",
      });
      clientRes.end();
      return false;
    }
  }

  const accept = String(clientReq.headers["accept"] || "");
  if (isGet && accept.indexOf("text/html") !== -1) {
    clientRes.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    });
    clientRes.end(buildAuthBootstrapHtml());
  } else {
    clientRes.writeHead(401, { "content-type": "text/plain" });
    clientRes.end("Unauthorized");
  }
  return false;
}

// Convex's browser client opens a raw WebSocket and cannot attach the preview
// auth token, so it can never follow the cross-origin auth redirect to a
// separate preview origin for the Convex ports. Instead the client points at this
// same (already-authenticated) preview origin under /__convex, and the proxy
// forwards those requests to the local Convex backend. /__convex-site maps to
// the Convex HTTP-actions port the same way.
//
// The agentation annotation widget has the same problem: it runs in the browser
// but its server listens on sandbox-localhost:4747, which the user's machine
// cannot reach. /__agentation forwards to it on the authenticated preview origin.
const CONVEX_PORT = 3210;
const CONVEX_SITE_PORT = 3211;
const AGENTATION_PORT = 4747;
const CONVEX_PREFIX = "/__convex";
const CONVEX_SITE_PREFIX = "/__convex-site";
const AGENTATION_PREFIX = "/__agentation";

// Returns the path with the prefix stripped (always leading-slashed), or null
// when "url" is not the prefix or a "/", "?", "#" delimited sub-path of it.
function matchPrefix(url, prefix) {
  if (url === prefix) return "/";
  if (!url.startsWith(prefix)) return null;
  const next = url[prefix.length];
  if (next !== "/" && next !== "?" && next !== "#") return null;
  const rest = url.slice(prefix.length);
  return next === "/" ? rest : "/" + rest;
}

// Maps an incoming request URL to an upstream port + stripped path. Anything
// outside the Convex prefixes goes to the dev server and gets HTML injection.
function resolveRoute(url) {
  const u = url || "/";
  const siteMatch = matchPrefix(u, CONVEX_SITE_PREFIX);
  if (siteMatch !== null) {
    return { port: CONVEX_SITE_PORT, path: siteMatch, injects: false };
  }
  const convexMatch = matchPrefix(u, CONVEX_PREFIX);
  if (convexMatch !== null) {
    return { port: CONVEX_PORT, path: convexMatch, injects: false };
  }
  const agentationMatch = matchPrefix(u, AGENTATION_PREFIX);
  if (agentationMatch !== null) {
    return { port: AGENTATION_PORT, path: agentationMatch, injects: false };
  }
  return { port: targetPort, path: u, injects: INJECT_ENABLED };
}

// Upstream apps set their session cookies with the browser's SameSite=Lax
// default, which cross-site iframes (Eva web app → *.vercel.run preview
// origin) silently drop — so signing in to the previewed app only worked when
// opened top-level in a new tab. Rewrite Set-Cookie with the same attributes
// the proxy's own session cookie uses (SameSite=None; Secure; Partitioned) so
// the app's sign-in works inside the preview iframe. Domain= is stripped: the
// upstream only knows its localhost host, which would pin the cookie to a
// host the browser never sees. Every rewrite is paired with an
// unpartitionedCookieDeletion of the same cookie (see below).
function rewriteSetCookie(value) {
  const parts = String(value).split(";");
  const kept = [parts[0]];
  for (let i = 1; i < parts.length; i += 1) {
    const attr = parts[i].trim();
    if (!attr) continue;
    const lower = attr.toLowerCase();
    if (lower.startsWith("samesite")) continue;
    if (lower.startsWith("domain")) continue;
    if (lower === "secure" || lower === "partitioned") continue;
    kept.push(attr);
  }
  return kept.join("; ") + "; Secure; SameSite=None; Partitioned";
}

// Same-name partitioned and unpartitioned cookies are distinct cookies to the
// browser (CHIPS) and are both sent in the Cookie header. A cookie the app
// wrote client-side via document.cookie is unpartitioned; once the proxy
// rewrites the server copy to Partitioned the two coexist and the upstream sees
// two values under one name (stale logouts, wrong account). Every rewritten
// Set-Cookie is therefore preceded by an expiry of the unpartitioned copy with
// the same name and path. Emitted FIRST so browsers without CHIPS (which
// ignore Partitioned and share one jar) delete then set, never set then delete.
function unpartitionedCookieDeletion(value) {
  const parts = String(value).split(";");
  const eq = parts[0].indexOf("=");
  const name = (eq === -1 ? parts[0] : parts[0].slice(0, eq)).trim();
  let path = "/";
  for (let i = 1; i < parts.length; i += 1) {
    const attr = parts[i].trim();
    if (attr.toLowerCase().startsWith("path=")) {
      path = attr.slice(5).trim();
    }
  }
  return name + "=; Path=" + path + "; Max-Age=0; Secure; SameSite=None";
}

const injectedScript = "(" + function () {
  const flag = "__evaPreviewNavigationSync";
  if (window[flag]) return;
  window[flag] = true;

  let parentOrigin = "*";
  try {
    if (document.referrer) {
      parentOrigin = new URL(document.referrer).origin;
    }
  } catch {}

  let lastHref = "";

  function sendLocation() {
    const href = window.location.href;
    if (href === lastHref) return;
    lastHref = href;
    window.parent.postMessage({ type: "navigation", url: href }, parentOrigin);
  }

  function scheduleLocationSend() {
    window.requestAnimationFrame(sendLocation);
  }

  const originalPushState = window.history.pushState;
  window.history.pushState = function pushState() {
    const result = originalPushState.apply(window.history, arguments);
    scheduleLocationSend();
    return result;
  };

  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = function replaceState() {
    const result = originalReplaceState.apply(window.history, arguments);
    scheduleLocationSend();
    return result;
  };

  window.addEventListener("popstate", scheduleLocationSend);
  window.addEventListener("hashchange", scheduleLocationSend);
  window.addEventListener("pageshow", scheduleLocationSend);
  window.addEventListener("load", scheduleLocationSend);
  document.addEventListener("click", function () {
    window.setTimeout(sendLocation, 0);
  }, true);

  window.addEventListener("message", function (event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "eva-preview-history-back") {
      window.history.back();
    }
    if (data.type === "eva-preview-history-forward") {
      window.history.forward();
    }
  });

  sendLocation();
}.toString() + ")();";

// The local Convex backend mints absolute URLs from its own loopback origin:
// storage.generateUploadUrl() returns http://127.0.0.1:3210/api/storage/…,
// and storage.getUrl() the same host — unreachable from the user's browser.
// Apps only point their Convex *client* at /__convex, so backend-minted URLs
// reach page code verbatim; this patch rewrites loopback Convex targets in
// fetch/XHR/WebSocket onto the proxied prefixes of the page's own origin.
const convexRewriteScript = "(" + function () {
  const flag = "__evaConvexLoopbackRewrite";
  if (window[flag]) return;
  window[flag] = true;

  function isLoopbackHost(hostname) {
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "[::1]"
    );
  }

  // In-sandbox browsers (agent-browser, curl-driven checks) reach loopback
  // directly; only pages served from a real preview origin need the rewrite.
  if (isLoopbackHost(window.location.hostname)) return;

  const PREFIX_BY_PORT = { 3210: "/__convex", 3211: "/__convex-site" };

  function rewriteLoopbackConvexUrl(value) {
    try {
      const url = new URL(String(value), window.location.href);
      if (!isLoopbackHost(url.hostname)) return null;
      const prefix = PREFIX_BY_PORT[url.port];
      if (!prefix) return null;
      const base =
        url.protocol === "ws:" || url.protocol === "wss:"
          ? window.location.origin.replace(/^http/, "ws")
          : window.location.origin;
      return base + prefix + url.pathname + url.search;
    } catch {
      return null;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (typeof input === "string" || input instanceof URL) {
        const rewritten = rewriteLoopbackConvexUrl(input);
        if (rewritten !== null) return originalFetch.call(this, rewritten, init);
      } else if (input instanceof Request) {
        const rewritten = rewriteLoopbackConvexUrl(input.url);
        if (rewritten !== null) {
          return originalFetch.call(this, new Request(rewritten, input), init);
        }
      }
    } catch {}
    return originalFetch.apply(this, arguments);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    try {
      const rewritten = rewriteLoopbackConvexUrl(arguments[1]);
      if (rewritten !== null) arguments[1] = rewritten;
    } catch {}
    return originalOpen.apply(this, arguments);
  };

  const NativeWebSocket = window.WebSocket;
  function PatchedWebSocket(url, protocols) {
    const rewritten = rewriteLoopbackConvexUrl(url);
    const target = rewritten !== null ? rewritten : url;
    return protocols === undefined
      ? new NativeWebSocket(target)
      : new NativeWebSocket(target, protocols);
  }
  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  PatchedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
  PatchedWebSocket.OPEN = NativeWebSocket.OPEN;
  PatchedWebSocket.CLOSING = NativeWebSocket.CLOSING;
  PatchedWebSocket.CLOSED = NativeWebSocket.CLOSED;
  window.WebSocket = PatchedWebSocket;

  // storage.getUrl() URLs land in the DOM (<img src>, <a href> download
  // links) without going through fetch, so rewrite those attributes too.
  function rewriteElementAttribute(element, name) {
    if (!element.getAttribute) return;
    const value = element.getAttribute(name);
    if (!value || value.indexOf("http") !== 0) return;
    const rewritten = rewriteLoopbackConvexUrl(value);
    if (rewritten !== null && rewritten !== value) {
      element.setAttribute(name, rewritten);
    }
  }

  function rewriteTree(root) {
    if (root.getAttribute) {
      rewriteElementAttribute(root, "src");
      rewriteElementAttribute(root, "href");
    }
    if (!root.querySelectorAll) return;
    const nodes = root.querySelectorAll("[src], [href]");
    for (let i = 0; i < nodes.length; i += 1) {
      rewriteElementAttribute(nodes[i], "src");
      rewriteElementAttribute(nodes[i], "href");
    }
  }

  const observer = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        rewriteElementAttribute(mutation.target, mutation.attributeName);
      } else {
        for (const node of mutation.addedNodes) {
          rewriteTree(node);
        }
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "href"],
  });
  rewriteTree(document);
}.toString() + ")();";

// Cookies the app writes client-side never pass through responseHeaders, so
// without this patch they keep the browser's unpartitioned default while the
// proxy's rewrite makes the server copies Partitioned — two same-name cookies
// in the Cookie header (see unpartitionedCookieDeletion). document.cookie
// therefore applies the very same attribute rules, deletion first so
// non-CHIPS browsers (one jar) end up with the rewritten cookie, not none.
function installPartitionedDocumentCookie(rewrite, deletion) {
  const flag = "__evaPartitionedDocumentCookie";
  if (window[flag]) return;
  window[flag] = true;
  // Mirrors the proxy's loopback exemption: in-sandbox browsers are not
  // behind the cookie rewrite, so their client-side cookies must stay as-is.
  const host = window.location.hostname;
  if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") return;
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  if (!descriptor || typeof descriptor.set !== "function" || typeof descriptor.get !== "function") return;
  Object.defineProperty(Document.prototype, "cookie", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set: function (value) {
      const text = String(value);
      descriptor.set.call(this, deletion(text));
      descriptor.set.call(this, rewrite(text));
    },
  });
}

const cookiePatchScript =
  "(" + installPartitionedDocumentCookie.toString() + ")(" +
  rewriteSetCookie.toString() + ", " + unpartitionedCookieDeletion.toString() + ");";

const ANNOTATION_SCRIPT = ${JSON.stringify(PREVIEW_ANNOTATION_SCRIPT)};

function buildInjectionTag() {
  const combined =
    cookiePatchScript +
    "\n" +
    convexRewriteScript +
    "\n" +
    injectedScript +
    "\n" +
    ANNOTATION_SCRIPT;
  const safeScript = combined.replace(/<\/script/gi, "<\\/script");
  return "<script data-eva-preview-nav-sync>" + safeScript + "</scr" + "ipt>";
}

function injectHtml(html) {
  if (html.includes("data-eva-preview-nav-sync")) return html;

  const tag = buildInjectionTag();
  if (html.includes("</head>")) {
    return html.replace("</head>", tag + "</head>");
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", tag + "</body>");
  }
  return tag + html;
}

// noVNC's vnc_lite.html uses <script type="module" crossorigin="anonymous">.
// That forces credentialsless CORS on every relative import. Even with ACAO:*
// some browsers still fail the module graph behind Vercel's edge ("Failed to
// fetch dynamically imported module"). Dropping crossorigin makes the loads
// ordinary same-origin module fetches (cookies included).
function stripModuleCrossorigin(html) {
  return html.replace(
    /(<script\b[^>]*\btype\s*=\s*["']module["'][^>]*)\s+crossorigin(?:\s*=\s*["'][^"']*["'])?/gi,
    "$1",
  );
}

// Vercel Sandbox edge serves identical noVNC bytes that fail ES-module
// instantiation for larger files (inflate.js / rfb.js), while the same files
// load fine from a public CDN. Point the RFB import at jsDelivr; the WebSocket
// still targets this origin via host/path query params.
const NOVNC_CDN_RFB =
  "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.7.0/core/rfb.js";

function rewriteNovncModuleImports(html) {
  return html
    .replace(
      /import\s+RFB\s+from\s+['"]\.\/core\/rfb\.js['"]/g,
      "import RFB from " + JSON.stringify(NOVNC_CDN_RFB),
    )
    .replace(
      /from\s+['"]\.\/core\/rfb\.js['"]/g,
      "from " + JSON.stringify(NOVNC_CDN_RFB),
    );
}

function rewriteHtml(html, injects) {
  let out = stripModuleCrossorigin(html);
  out = rewriteNovncModuleImports(out);
  if (injects) {
    out = injectHtml(out);
  }
  return out;
}

// Vercel exposes each sandbox port on its OWN "*.vercel.run" subdomain (unlike
// Daytona's single host + port-prefix scheme). The proxy has no way to learn
// its own external hostname (Vercel's edge terminates TLS before this
// process), so it cannot rewrite a redirect to "the current host, new path" —
// it can only strip the host entirely and rely on the browser resolving a
// path-only Location against whatever origin it is already on. That is
// exactly what we want: any absolute "*.vercel.run" Location (e.g. the app
// building an absolute URL from a Host header that resolved to the unproxied
// dev-server port) would otherwise send the browser to a DIFFERENT port's
// subdomain than the one it loaded the page from, which Vercel's edge then
// rejects as "port is not exposed" for that host/path combination.
const VERCEL_HOST_SUFFIX = ".vercel.run";

function rewriteLocationHeader(value) {
  try {
    const parsed = new URL(value, "http://127.0.0.1:" + String(targetPort));
    const isLocalUpstream =
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      Number(parsed.port || "80") === targetPort;
    const isVercelHost = parsed.hostname.endsWith(VERCEL_HOST_SUFFIX);
    if (isLocalUpstream || isVercelHost) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    return value;
  } catch {
    return value;
  }
}

function responseHeaders(upstreamHeaders, injectsHtml, addCors, rewriteCookies) {
  const headers = {};
  for (const name of Object.keys(upstreamHeaders)) {
    const lower = name.toLowerCase();
    if (lower === "content-security-policy") continue;
    if (lower === "x-frame-options") continue;
    if (injectsHtml && lower === "content-length") continue;

    const value = upstreamHeaders[name];
    if (value === undefined) continue;

    if (lower === "location") {
      if (Array.isArray(value)) {
        headers[name] = value.map(rewriteLocationHeader);
      } else {
        headers[name] = rewriteLocationHeader(String(value));
      }
      continue;
    }

    if (lower === "set-cookie" && rewriteCookies) {
      const cookies = Array.isArray(value) ? value : [String(value)];
      const out = [];
      for (const cookie of cookies) {
        out.push(unpartitionedCookieDeletion(String(cookie)));
        out.push(rewriteSetCookie(String(cookie)));
      }
      headers[name] = out;
      continue;
    }

    headers[name] = value;
  }

  if (injectsHtml) {
    headers["cache-control"] = "no-store";
  }

  // noVNC loads RFB as <script type="module" crossorigin="anonymous">, which
  // requires ACAO even for same-origin module graphs. Without it the browser
  // rejects the module and the page never leaves "Loading".
  if (addCors) {
    headers["access-control-allow-origin"] = "*";
  }

  return headers;
}

function requestHeaders(clientHeaders, routePort) {
  const headers = {};
  for (const name of Object.keys(clientHeaders)) {
    const lower = name.toLowerCase();
    if (lower === "host") continue;
    if (lower === "accept-encoding") continue;

    const value = clientHeaders[name];
    if (value === undefined) continue;
    headers[name] = value;
  }
  headers.host = "127.0.0.1:" + String(routePort);
  headers["accept-encoding"] = "identity";
  return headers;
}

const server = http.createServer(function handleRequest(clientReq, clientRes) {
  const path = clientReq.url || "/";
  if (path === healthPath) {
    clientRes.writeHead(200, { "content-type": "text/plain" });
    clientRes.end("target=" + String(targetPort) + ";" + SCRIPT_VERSION);
    return;
  }
  if (path.split("?")[0] === html2canvasPath) {
    if (!authorize(clientReq, clientRes)) return;
    clientRes.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400",
    });
    clientRes.end(HTML2CANVAS_SCRIPT);
    return;
  }

  if (!authorize(clientReq, clientRes)) return;

  // Strip a (consumed/stale) grant param before forwarding so it never leaks
  // to the dev server's own request logs.
  let routePath = path;
  if (GATE_ENABLED && routePath.indexOf(GRANT_PARAM) !== -1) {
    try {
      const u = new URL(routePath, "https://127.0.0.1");
      u.searchParams.delete(GRANT_PARAM);
      routePath = u.pathname + u.search + u.hash;
    } catch {}
  }

  const route = resolveRoute(routePath);

  const upstreamReq = http.request(
    {
      hostname: "127.0.0.1",
      port: route.port,
      path: route.path,
      method: clientReq.method,
      headers: requestHeaders(clientReq.headers, route.port),
    },
    function handleUpstream(upstreamRes) {
      const contentType = String(upstreamRes.headers["content-type"] || "");
      const contentEncoding = String(
        upstreamRes.headers["content-encoding"] || "",
      );
      const isHtml =
        contentType.toLowerCase().includes("text/html") && !contentEncoding;
      const injectsHtml = route.injects && isHtml;
      // Always rewrite HTML so noVNC module scripts lose crossorigin=.
      const rewriteHtmlBody = isHtml;
      let pathname = route.path;
      try {
        pathname = new URL(route.path, "https://127.0.0.1").pathname;
      } catch {}
      const addCors = STATIC_ASSET_RE.test(pathname);

      // Loopback clients (in-sandbox agent browser, curl, Inngest) talk plain
      // http to localhost — leave their cookies untouched.
      clientRes.writeHead(
        upstreamRes.statusCode || 502,
        responseHeaders(
          upstreamRes.headers,
          rewriteHtmlBody,
          addCors,
          !isLoopbackRequest(clientReq),
        ),
      );

      if (!rewriteHtmlBody) {
        upstreamRes.pipe(clientRes);
        return;
      }

      // noVNC / code-server HTML must be rewritten as a whole document
      // (vnc_lite.html imports RFB at the END of <body>, so the module
      // rewrites cannot stop at </head>). Those pages are tiny static files,
      // so buffering them is free.
      if (BUFFER_WHOLE_HTML) {
        const chunks = [];
        upstreamRes.on("data", function handleData(chunk) {
          chunks.push(chunk);
        });
        upstreamRes.on("end", function handleEnd() {
          const html = Buffer.concat(chunks).toString("utf8");
          clientRes.end(rewriteHtml(html, injectsHtml));
        });
        return;
      }

      // Dev-server HTML streams. Buffering the full document here destroyed
      // upstream streaming (Next.js flushes a static shell in ~0.5s, then
      // streams the rest): TTFB became equal to total render time. Instead,
      // buffer only until </head>, inject the script there, then pass every
      // later byte straight through as it arrives.
      const HEAD_CLOSE = "</head>";
      let pending = Buffer.alloc(0);
      let injected = false;

      function writeWithBackpressure(chunk) {
        if (!clientRes.write(chunk)) {
          upstreamRes.pause();
          clientRes.once("drain", function handleDrain() {
            upstreamRes.resume();
          });
        }
      }

      upstreamRes.on("data", function handleData(chunk) {
        if (injected) {
          writeWithBackpressure(chunk);
          return;
        }
        pending =
          pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        const idx = pending.indexOf(HEAD_CLOSE);
        if (idx === -1) return;
        injected = true;
        // Split on the byte offset right after </head> (ASCII, so the prefix
        // is always a complete UTF-8 sequence); the tail is forwarded as raw
        // bytes and never decoded.
        const headEnd = idx + HEAD_CLOSE.length;
        clientRes.write(
          rewriteHtml(pending.slice(0, headEnd).toString("utf8"), injectsHtml),
        );
        const rest = pending.slice(headEnd);
        pending = Buffer.alloc(0);
        if (rest.length > 0) {
          writeWithBackpressure(rest);
        }
      });
      upstreamRes.on("end", function handleEnd() {
        if (injected) {
          clientRes.end();
          return;
        }
        // No </head> in the document: fall back to the whole-document rewrite
        // (injectHtml handles </body> and prepend). Everything is already
        // buffered in "pending", so nothing was lost by waiting.
        clientRes.end(rewriteHtml(pending.toString("utf8"), injectsHtml));
      });
    },
  );

  upstreamReq.on("error", function handleProxyError(error) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    clientRes.end("Preview proxy upstream error: " + error.message);
  });

  clientReq.pipe(upstreamReq);
});

server.on("upgrade", function handleUpgrade(req, socket, head) {
  // WebSockets cannot follow the HTML grant→cookie 302. In cross-site iframes
  // (Eva web app → *.vercel.run) the Partitioned session cookie is also often
  // missing on the upgrade request, which left noVNC stuck on "Loading".
  // Accept either a valid session cookie OR a grant on the upgrade URL
  // (DesktopPanel forwards __eva_grant via noVNC's path query param).
  if (GATE_ENABLED && !isLoopbackRequest(req)) {
    const cookies = parseCookies(req.headers["cookie"]);
    const session = cookies[SESSION_COOKIE];
    let authorized = Boolean(session && verifySession(session));
    if (!authorized) {
      try {
        const parsed = new URL(
          req.url || "/",
          "https://" + (req.headers["host"] || "127.0.0.1"),
        );
        const grant = parsed.searchParams.get(GRANT_PARAM);
        if (grant && verifyGrant(grant)) {
          authorized = true;
        }
      } catch {}
    }
    if (!authorized) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  // Strip grant from the upstream path so websockify sees a clean /websockify.
  let upgradeUrl = req.url || "/";
  if (GATE_ENABLED && upgradeUrl.indexOf(GRANT_PARAM) !== -1) {
    try {
      const u = new URL(upgradeUrl, "https://127.0.0.1");
      u.searchParams.delete(GRANT_PARAM);
      upgradeUrl = u.pathname + u.search + u.hash;
    } catch {}
  }
  const route = resolveRoute(upgradeUrl);
  const upstream = net.connect(route.port, "127.0.0.1", function handleConnect() {
    const lines = [
      (req.method || "GET") + " " + route.path + " HTTP/" + req.httpVersion,
    ];

    for (const name of Object.keys(req.headers)) {
      const value = req.headers[name];
      if (value === undefined) continue;
      if (name.toLowerCase() === "host") {
        lines.push("host: 127.0.0.1:" + String(route.port));
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          lines.push(name + ": " + item);
        }
      } else {
        lines.push(name + ": " + String(value));
      }
    }

    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length > 0) {
      upstream.write(head);
    }

    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", function handleUpgradeError() {
    socket.destroy();
  });
});

server.listen(proxyPort, "0.0.0.0", function handleListen() {
  console.log(
    "Eva preview proxy listening on " +
      String(proxyPort) +
      " -> 127.0.0.1:" +
      String(targetPort),
  );
});
`.trim();
}

async function proxyAlreadyRunning(
  sandbox: SandboxHandle,
  targetPort: number,
  proxyPort: number,
): Promise<boolean> {
  try {
    const health = await execHandle(
      sandbox,
      `curl -fsS http://127.0.0.1:${proxyPort}${HEALTH_PATH}`,
      5,
      "/tmp",
    );
    // Version suffix forces a relaunch when the script changes across deploys.
    return health.trim() === `target=${targetPort};${SCRIPT_VERSION}`;
  } catch {
    return false;
  }
}

async function launchProxy(
  sandbox: SandboxHandle,
  targetPort: number,
  proxyPort: number,
  authParams: PreviewProxyAuthParams,
): Promise<void> {
  const scriptPath = `/tmp/eva-preview-proxy-${targetPort}.mjs`;
  const pidPath = `/tmp/eva-preview-proxy-${targetPort}.pid`;
  const logPath = `/tmp/eva-preview-proxy-${targetPort}.log`;
  const script = buildPreviewProxyScript(authParams);
  // The script is written with the file API, not a heredoc inside the exec
  // command. It embeds the vendored html2canvas bundle (~200 KB), which pushes
  // the single `bash -lc` argument past Linux's 128 KB per-argument cap
  // (MAX_ARG_STRLEN), so every launch died with "failed to start process:
  // fork/exec /usr/bin/bash: argument list too long". writeFile has no such
  // limit (the ~330 KB callback runner ships the same way).
  await writeSandboxFile(sandbox, scriptPath, script);
  const command = [
    `if [ -f '${pidPath}' ] && kill -0 "$(cat '${pidPath}')" 2>/dev/null; then kill "$(cat '${pidPath}')" 2>/dev/null || true; fi`,
    `if command -v fuser >/dev/null 2>&1; then fuser -k ${proxyPort}/tcp >/dev/null 2>&1 || true; fi`,
    `if command -v lsof >/dev/null 2>&1; then for p in $(lsof -ti :${proxyPort} 2>/dev/null || true); do kill "$p" 2>/dev/null || true; done; fi`,
    `sleep 0.2`,
  ].join("\n");

  await execHandle(sandbox, command, 15, "/tmp");
  // Detach the proxy process so it survives on Vercel (nohup … & zombies there).
  await sandbox.execDetached(
    `EVA_PREVIEW_TARGET_PORT=${targetPort} EVA_PREVIEW_PROXY_PORT=${proxyPort} node '${scriptPath}' > '${logPath}' 2>&1`,
  );
  await execHandle(
    sandbox,
    `i=0; while [ "$i" -lt 20 ]; do if curl -fsS 'http://127.0.0.1:${proxyPort}${HEALTH_PATH}' >/dev/null 2>&1; then exit 0; fi; i=$((i+1)); sleep 0.25; done; tail -n 80 '${logPath}' 2>/dev/null || true; exit 1`,
    15,
    "/tmp",
  );
}

/**
 * Starts a small in-sandbox reverse proxy for the dev server. The proxy injects
 * a route-sync script into HTML so the cross-origin iframe can report SPA and
 * full-page navigations to Eva via postMessage.
 */
export async function ensurePreviewNavigationProxy(
  sandbox: SandboxHandle,
  targetPort: number,
  authParams: PreviewProxyAuthParams,
  fixedProxyPort?: number,
): Promise<number> {
  if (!isPort(targetPort)) {
    throw new Error(`Invalid preview target port: ${targetPort}`);
  }

  const proxyPort = await resolvePreviewProxyPort(
    sandbox,
    targetPort,
    fixedProxyPort,
  );
  if (await proxyAlreadyRunning(sandbox, targetPort, proxyPort)) {
    return proxyPort;
  }

  await launchProxy(sandbox, targetPort, proxyPort, authParams);
  return proxyPort;
}
