import { describe, expect, test } from "vitest";
import { extractFunctionSource } from "./_helpers/previewProxySource";

/**
 * The grant is a five-minute bearer token. Eva mints a fresh one on every
 * preview load, so it often arrives while the session cookie is already
 * valid. The proxy used to let those requests through with the grant still in
 * the iframe URL, where apps copied it into shareable links.
 */
const authorizeSource = extractFunctionSource(
  "function authorize(clientReq, clientRes) {",
);
const factory = new Function(
  "verifySession",
  "verifyGrant",
  `const GATE_ENABLED = true;
const GRANT_PARAM = "__eva_grant";
const SESSION_COOKIE = "__eva_preview_session";
const SESSION_TTL_SECONDS = 60;
const SANDBOX_ID = "sb";
const STATIC_ASSET_RE = /\\.js$/;
function isLoopbackRequest() { return false; }
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k) out[k] = v;
  }
  return out;
}
function signSession() { return "minted"; }
function buildAuthBootstrapHtml() { return "<html>"; }
${authorizeSource}
return authorize;`,
);

type Res = { status: number; headers: Record<string, string> };

function run(opts: {
  url: string;
  method?: string;
  cookie?: string;
  grantValid?: boolean;
}): { allowed: boolean; res: Res } {
  const authorize = factory(
    (token: string) => token === "good",
    () => (opts.grantValid ? { sub: "user_1" } : null),
  );
  const res: Res = { status: 0, headers: {} };
  const allowed = authorize(
    {
      url: opts.url,
      method: opts.method ?? "GET",
      headers: {
        host: "preview.test",
        accept: "text/html",
        cookie: opts.cookie ?? "",
      },
    },
    {
      writeHead(status: number, headers: Record<string, string>) {
        res.status = status;
        res.headers = headers;
      },
      end() {},
    },
  );
  return { allowed, res };
}

describe("previewProxy authorize strips the grant from the browser URL", () => {
  test("valid session + grant on GET redirects to the clean URL without re-minting", () => {
    const { allowed, res } = run({
      url: "/slides/a?slide=5&__eva_grant=xyz",
      cookie: "__eva_preview_session=good",
    });
    expect(allowed).toBe(false);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/slides/a?slide=5");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("no session + valid grant mints the cookie and redirects", () => {
    const { allowed, res } = run({
      url: "/?__eva_grant=xyz",
      grantValid: true,
    });
    expect(allowed).toBe(false);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(res.headers["set-cookie"]).toContain("__eva_preview_session=minted");
  });

  test("valid session without a grant passes through", () => {
    const { allowed } = run({
      url: "/slides/a",
      cookie: "__eva_preview_session=good",
    });
    expect(allowed).toBe(true);
  });

  test("valid session + grant on POST passes through instead of redirecting", () => {
    const { allowed } = run({
      url: "/api?__eva_grant=xyz",
      method: "POST",
      cookie: "__eva_preview_session=good",
    });
    expect(allowed).toBe(true);
  });

  test("no session + invalid grant falls back to the sign-in bootstrap", () => {
    const { allowed, res } = run({ url: "/?__eva_grant=bad" });
    expect(allowed).toBe(false);
    expect(res.status).toBe(200);
  });
});
