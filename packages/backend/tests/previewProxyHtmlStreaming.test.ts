import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";
import {
  extractFunctionSource,
  previewProxySource,
} from "./_helpers/previewProxySource";

/**
 * The preview proxy used to buffer every HTML byte so it could inject the
 * nav-sync script anywhere in the document. That made TTFB equal to total
 * render time behind the proxy: a Next.js page whose static shell flushes in
 * ~0.5s showed nothing for 10-16s (fix 6f1629e5). Dev-server HTML now buffers
 * only to `</head>`, injects there, and pipes every later byte through as it
 * arrives — while desktop (noVNC) and editor (code-server) HTML keeps
 * whole-document buffering because those rewrites target the end of `<body>`.
 *
 * This runs the real shipped `handleUpstream` against a fake streaming
 * upstream. `buildInjectionTag` is stubbed (it interpolates the generated
 * script) and the noVNC CDN constant is a placeholder; everything else —
 * chunk accumulation, the split point, the byte passthrough, the fallback and
 * the header rewrite — is the code that ships.
 */

const INJECTION_TAG = "<script data-eva-preview-nav-sync>NAV</script>";

type ChunkSink = (chunk: Buffer) => boolean;

interface FakeClientRes {
  writeHead: (status: number, headers: Record<string, unknown>) => void;
  write: ChunkSink;
  end: (chunk?: Buffer | string) => void;
  once: (event: string, listener: () => void) => void;
  /** Every write/end payload, in order. */
  writes: Buffer[];
  /** Payload count at the moment `end` was called. */
  writesBeforeEnd: number;
  headers: Record<string, unknown>;
  status: number;
  ended: boolean;
  drain: () => void;
}

interface FakeUpstreamRes extends EventEmitter {
  headers: Record<string, string>;
  statusCode: number;
  paused: number;
  resumed: number;
  piped: unknown[];
}

type HandleUpstream = (upstreamRes: FakeUpstreamRes) => void;

const handleUpstreamFactory = new Function(
  "TAB_SKIP_PREFIX_RE",
  "BUFFER_WHOLE_HTML",
  "INJECTION_TAG",
  "targetPort",
  "VERCEL_HOST_SUFFIX",
  "STATIC_ASSET_RE",
  "isLoopbackRequest",
  "ACTIVITY_PING_PAGES",
  "route",
  "clientReq",
  "clientRes",
  [
    // Stubbed: the real tag embeds the generated nav-sync + annotation scripts.
    "function buildInjectionTag() { return INJECTION_TAG; }",
    'const NOVNC_CDN_RFB = "https://cdn.example.test/rfb.js";',
    // Stubbed: the real ping script interpolates the heartbeat interval.
    'const visibilityPingScript = "PING";',
    extractFunctionSource("function isDocumentRequest(req) {"),
    extractFunctionSource("function insertBeforeHeadOrBodyClose(html, tag) {"),
    extractFunctionSource("function injectVisibilityPing(html) {"),
    extractFunctionSource("function stripModuleCrossorigin(html) {"),
    extractFunctionSource("function rewriteNovncModuleImports(html) {"),
    extractFunctionSource("function injectHtml(html) {"),
    extractFunctionSource("function prefixTabPath(value, tabPrefix) {"),
    extractFunctionSource("function rewriteTabHtml(html, tabPrefix) {"),
    extractFunctionSource("function rewriteHtml(html, injects, tabPrefix, pings) {"),
    extractFunctionSource("function rewriteLocationHeader(value, route) {"),
    extractFunctionSource("function rewriteSetCookie(value) {"),
    extractFunctionSource("function responseHeaders("),
    extractFunctionSource("function handleUpstream(upstreamRes) {"),
    "return handleUpstream;",
  ].join("\n\n"),
);

interface HarnessOptions {
  bufferWholeHtml?: boolean;
  /** Proxy-level switch for the on-screen idle-pause ping. */
  pingPages?: boolean;
  /** Request headers, e.g. `sec-fetch-dest` for a document load. */
  requestHeaders?: Record<string, string>;
  /** `false` makes every clientRes.write report backpressure. */
  acceptWrites?: boolean;
  /** Replaces the stubbed nav-sync tag. */
  injectionTag?: string;
}

function createHarness(options: HarnessOptions = {}) {
  const {
    bufferWholeHtml = false,
    acceptWrites = true,
    pingPages = false,
    requestHeaders = {},
    injectionTag = INJECTION_TAG,
  } = options;

  const drainListeners: Array<() => void> = [];
  const clientRes: FakeClientRes = {
    writes: [],
    writesBeforeEnd: -1,
    headers: {},
    status: 0,
    ended: false,
    writeHead(status, headers) {
      clientRes.status = status;
      clientRes.headers = headers;
    },
    write(chunk) {
      clientRes.writes.push(Buffer.from(chunk));
      return acceptWrites;
    },
    end(chunk) {
      clientRes.writesBeforeEnd = clientRes.writes.length;
      if (chunk !== undefined) clientRes.writes.push(Buffer.from(chunk));
      clientRes.ended = true;
    },
    once(event, listener) {
      if (event === "drain") drainListeners.push(listener);
    },
    drain() {
      for (const listener of drainListeners.splice(0)) listener();
    },
  };

  const handleUpstream: HandleUpstream = handleUpstreamFactory(
    /^\/(?:__tab\/|__convex|__agentation|__eva_preview_proxy)/,
    bufferWholeHtml,
    injectionTag,
    3000,
    ".vercel.run",
    /^$/,
    () => false,
    pingPages,
    { port: 3000, path: "/", injects: true, tabPrefix: null },
    { headers: requestHeaders },
    clientRes,
  );

  function upstream(
    headers: Record<string, string> = { "content-type": "text/html" },
  ): FakeUpstreamRes {
    const piped: unknown[] = [];
    const res = Object.assign(new EventEmitter(), {
      headers,
      statusCode: 200,
      paused: 0,
      resumed: 0,
      piped,
      pause() {
        res.paused += 1;
      },
      resume() {
        res.resumed += 1;
      },
      pipe(destination: unknown) {
        res.piped.push(destination);
      },
    });
    return res;
  }

  return { clientRes, handleUpstream, upstream };
}

/** Concatenated bytes the client received, as text. */
function received(clientRes: FakeClientRes): string {
  return Buffer.concat(clientRes.writes).toString("utf8");
}

describe("dev-server HTML streams through the preview proxy", () => {
  test("the shell reaches the client before upstream finishes", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream();
    handleUpstream(res);

    res.emit("data", Buffer.from("<html><head><title>a</title></head><body>"));

    // The regression: nothing was flushed until upstream ended, so TTFB was
    // the full render time.
    expect(clientRes.writes.length).toBeGreaterThan(0);
    expect(clientRes.ended).toBe(false);
    expect(received(clientRes)).toContain(INJECTION_TAG);
  });

  test("the script is injected once, at the head, and the tail is untouched", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream();
    handleUpstream(res);

    res.emit("data", Buffer.from("<html><head><title>a</title></head>"));
    res.emit("data", Buffer.from("<body>shell"));
    res.emit("data", Buffer.from("<p>streamed later</p></body></html>"));
    res.emit("end");

    expect(received(clientRes)).toBe(
      `<html><head><title>a</title>${INJECTION_TAG}</head>` +
        "<body>shell<p>streamed later</p></body></html>",
    );
    expect(received(clientRes).split(INJECTION_TAG)).toHaveLength(2);
    expect(clientRes.ended).toBe(true);
  });

  test("a `</head>` split across chunks is still found", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream();
    handleUpstream(res);

    for (const part of ["<html><he", "ad></he", "ad><body>x</body></html>"]) {
      res.emit("data", Buffer.from(part));
    }
    res.emit("end");

    expect(received(clientRes)).toBe(
      `<html><head>${INJECTION_TAG}</head><body>x</body></html>`,
    );
  });

  test("post-injection bytes are forwarded raw, so a split multi-byte character survives", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream();
    handleUpstream(res);

    const tail = Buffer.from("<body>née 🎉</body>", "utf8");
    const splitAt = tail.indexOf(Buffer.from("🎉", "utf8")) + 2;

    res.emit("data", Buffer.from("<html><head></head>"));
    res.emit("data", tail.subarray(0, splitAt));
    res.emit("data", tail.subarray(splitAt));
    res.emit("end");

    // Decoding each chunk separately would replace the halved emoji with U+FFFD.
    expect(received(clientRes)).toBe(
      `<html><head>${INJECTION_TAG}</head>${tail.toString("utf8")}`,
    );
  });

  test("a document with no `</head>` falls back to whole-document injection", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream();
    handleUpstream(res);

    res.emit("data", Buffer.from("<html><body>no head"));
    res.emit("data", Buffer.from("</body></html>"));
    expect(clientRes.writes).toHaveLength(0);
    res.emit("end");

    expect(received(clientRes)).toBe(
      `<html><body>no head${INJECTION_TAG}</body></html>`,
    );
  });

  test("a slow client pauses upstream and resumes on drain", () => {
    const { clientRes, handleUpstream, upstream } = createHarness({
      acceptWrites: false,
    });
    const res = upstream();
    handleUpstream(res);

    res.emit("data", Buffer.from("<html><head></head>"));
    res.emit("data", Buffer.from("<body>a</body>"));

    // Without backpressure the proxy would buffer an unbounded response.
    expect(res.paused).toBeGreaterThan(0);
    expect(res.resumed).toBe(0);
    clientRes.drain();
    expect(res.resumed).toBe(res.paused);
  });

  test("content-length is dropped, since injection changes the byte count", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    handleUpstream(
      upstream({ "content-type": "text/html", "content-length": "42" }),
    );

    expect(clientRes.status).toBe(200);
    expect(clientRes.headers).not.toHaveProperty("content-length");
    expect(clientRes.headers["cache-control"]).toBe("no-store");
  });

  test("non-HTML responses are piped straight through", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream({ "content-type": "application/json" });
    handleUpstream(res);

    res.emit("data", Buffer.from("{}"));
    expect(res.piped).toEqual([clientRes]);
    expect(clientRes.writes).toHaveLength(0);
  });

  test("gzipped HTML is not rewritten, since the proxy would corrupt it", () => {
    const { clientRes, handleUpstream, upstream } = createHarness();
    const res = upstream({
      "content-type": "text/html",
      "content-encoding": "gzip",
    });
    handleUpstream(res);

    expect(res.piped).toEqual([clientRes]);
  });
});

/**
 * noVNC's vnc_lite.html imports RFB at the END of `<body>`, so the desktop and
 * editor proxies must still see the whole document before rewriting it.
 * Streaming those would break the module rewrites with no error.
 */
describe("desktop and editor HTML keeps whole-document buffering", () => {
  test("nothing is flushed until upstream ends", () => {
    const { clientRes, handleUpstream, upstream } = createHarness({
      bufferWholeHtml: true,
    });
    const res = upstream();
    handleUpstream(res);

    res.emit("data", Buffer.from("<html><head></head><body>a"));
    expect(clientRes.writes).toHaveLength(0);

    res.emit("data", Buffer.from("</body></html>"));
    res.emit("end");

    expect(clientRes.writesBeforeEnd).toBe(0);
    expect(received(clientRes)).toBe(
      `<html><head>${INJECTION_TAG}</head><body>a</body></html>`,
    );
  });

  test("the desktop and editor ports are the ones that buffer", () => {
    // Behaviour above is driven by BUFFER_WHOLE_HTML; pin what sets it.
    const definition = previewProxySource.slice(
      previewProxySource.indexOf("const BUFFER_WHOLE_HTML"),
      previewProxySource.indexOf(
        ";",
        previewProxySource.indexOf("const BUFFER_WHOLE_HTML"),
      ),
    );
    expect(definition).toContain("VERCEL_DESKTOP_INTERNAL_PORT");
    expect(definition).toContain("VERCEL_EDITOR_INTERNAL_PORT");
  });
});

/**
 * Idle pause: a hidden tab used to keep its sandbox awake for hours because
 * every request it made (polls, reconnects) counted as a human. Documents now
 * carry an on-screen ping instead, and only real document loads get it.
 */
describe("on-screen ping injection", () => {
  const PING_TAG = "<script data-eva-preview-activity>PING</script>";

  test("a document load gets the ping once, next to the nav-sync script", () => {
    const { clientRes, handleUpstream, upstream } = createHarness({
      pingPages: true,
      requestHeaders: { "sec-fetch-dest": "iframe" },
    });
    const res = upstream();
    handleUpstream(res);
    res.emit("data", Buffer.from("<html><head></head><body>x</body></html>"));
    res.emit("end");

    expect(received(clientRes)).toBe(
      `<html><head>${INJECTION_TAG}${PING_TAG}</head><body>x</body></html>`,
    );
  });

  test("an HTML fragment the app fetches itself is left alone", () => {
    const { clientRes, handleUpstream, upstream } = createHarness({
      pingPages: true,
      requestHeaders: { "sec-fetch-dest": "empty" },
    });
    const res = upstream();
    handleUpstream(res);
    res.emit("data", Buffer.from("<html><head></head><body>x</body></html>"));
    res.emit("end");

    expect(received(clientRes)).not.toContain(PING_TAG);
  });

  test("desktop and editor proxies (ping off) never inject it", () => {
    const { clientRes, handleUpstream, upstream } = createHarness({
      requestHeaders: { "sec-fetch-dest": "document" },
    });
    const res = upstream();
    handleUpstream(res);
    res.emit("data", Buffer.from("<html><head></head><body>x</body></html>"));
    res.emit("end");

    expect(received(clientRes)).not.toContain(PING_TAG);
  });

  // The annotation script's CSS escape holds "$&". String.replace expanded it
  // to </head>, so the ping tag landed inside the nav-sync script and its
  // </script> leaked the rest of that script onto the page as text.
  test("a '$&' in the nav-sync script stays literal and the ping lands after it", () => {
    const navTag = '<script data-eva-preview-nav-sync>x.replace(/a/g, "\\\\$&");</script>';
    const { clientRes, handleUpstream, upstream } = createHarness({
      pingPages: true,
      requestHeaders: { "sec-fetch-dest": "iframe" },
      injectionTag: navTag,
    });
    const res = upstream();
    handleUpstream(res);
    res.emit("data", Buffer.from("<html><head></head><body>x</body></html>"));
    res.emit("end");

    expect(received(clientRes)).toBe(
      `<html><head>${navTag}${PING_TAG}</head><body>x</body></html>`,
    );
  });
});
