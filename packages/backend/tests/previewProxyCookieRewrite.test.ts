import { afterEach, describe, expect, test } from "vitest";
import {
  extractFunctionSource,
  previewProxySource as proxySource,
} from "./_helpers/previewProxySource";

/**
 * Guards the Set-Cookie rewrite that keeps sandboxed-app sign-in alive inside
 * cross-site preview iframes (fix c3cbe297). Browsers silently drop
 * SameSite=Lax cookies set from a cross-site frame, so the proxy must rewrite
 * every upstream Set-Cookie to `Secure; SameSite=None; Partitioned`. If that
 * rewrite regresses, iframe sign-in breaks again with no runtime error.
 */
const rewriteSetCookieSource = extractFunctionSource(
  "function rewriteSetCookie(value) {",
);
const factory = new Function(
  `${rewriteSetCookieSource}\nreturn rewriteSetCookie;`,
);
const rewriteSetCookie: (value: string) => string = factory();

describe("previewProxy rewriteSetCookie", () => {
  test("replaces SameSite=Lax with the cross-site iframe attributes", () => {
    expect(rewriteSetCookie("sid=abc; Path=/; HttpOnly; SameSite=Lax")).toBe(
      "sid=abc; Path=/; HttpOnly; Secure; SameSite=None; Partitioned",
    );
  });

  test("adds the attributes when upstream sets none", () => {
    expect(rewriteSetCookie("sid=abc")).toBe(
      "sid=abc; Secure; SameSite=None; Partitioned",
    );
  });

  test("strips Domain so the cookie is not pinned to the localhost upstream host", () => {
    expect(
      rewriteSetCookie("sid=abc; Domain=localhost; Path=/; SameSite=Strict"),
    ).toBe("sid=abc; Path=/; Secure; SameSite=None; Partitioned");
  });

  test("does not duplicate Secure or Partitioned when already present", () => {
    const result = rewriteSetCookie(
      "sid=abc; Secure; SameSite=None; Partitioned",
    );
    expect(result).toBe("sid=abc; Secure; SameSite=None; Partitioned");
    expect(result.match(/Secure/gi)).toHaveLength(1);
    expect(result.match(/Partitioned/gi)).toHaveLength(1);
  });

  test("preserves the cookie name/value and unrelated attributes", () => {
    expect(
      rewriteSetCookie(
        "session=a=b=c; Path=/app; Max-Age=3600; HttpOnly; SameSite=Lax",
      ),
    ).toBe(
      "session=a=b=c; Path=/app; Max-Age=3600; HttpOnly; Secure; SameSite=None; Partitioned",
    );
  });
});

/**
 * Behaviour cannot cover where the rewrite is wired, so lock the two call-site
 * invariants of the fix as a source contract: the rewrite is applied to
 * Set-Cookie, and only for non-loopback clients (in-sandbox curl / agent
 * browser talk plain http to localhost and must keep their cookies untouched).
 */
describe("previewProxy Set-Cookie rewrite wiring", () => {
  test("rewrite is gated on the set-cookie header", () => {
    expect(proxySource).toContain('lower === "set-cookie" && rewriteCookies');
  });

  test("loopback clients are exempt from the cookie rewrite", () => {
    expect(proxySource).toContain("!isLoopbackRequest(clientReq)");
  });
});

/**
 * A partitioned and an unpartitioned cookie of the same name are two distinct
 * cookies under CHIPS and are both sent in the Cookie header, so once the proxy
 * partitions the server copy the app's own document.cookie copy lingers and the
 * upstream reads two values under one name (logout clears one, the other keeps
 * a signed-out session alive). Every rewritten cookie must therefore be
 * preceded by an expiry of the unpartitioned copy with the same name and path.
 */
const unpartitionedCookieDeletionSource = extractFunctionSource(
  "function unpartitionedCookieDeletion(value) {",
);
const deletionFactory = new Function(
  `${unpartitionedCookieDeletionSource}\nreturn unpartitionedCookieDeletion;`,
);
const unpartitionedCookieDeletion: (value: string) => string =
  deletionFactory();

describe("previewProxy unpartitionedCookieDeletion", () => {
  test("expires the same name and path with no Partitioned attribute", () => {
    expect(
      unpartitionedCookieDeletion("sid=abc; Path=/app; HttpOnly; SameSite=Lax"),
    ).toBe("sid=; Path=/app; Max-Age=0; Secure; SameSite=None");
  });

  test("defaults to Path=/ when upstream sets no path", () => {
    expect(unpartitionedCookieDeletion("sid=abc; HttpOnly")).toBe(
      "sid=; Path=/; Max-Age=0; Secure; SameSite=None",
    );
  });

  test("honours a lowercase path attribute", () => {
    expect(unpartitionedCookieDeletion("sid=abc; path=/x")).toBe(
      "sid=; Path=/x; Max-Age=0; Secure; SameSite=None",
    );
  });

  test("trims whitespace around the cookie name", () => {
    expect(unpartitionedCookieDeletion("  sid  =abc; Path=/")).toBe(
      "sid=; Path=/; Max-Age=0; Secure; SameSite=None",
    );
  });

  test("takes the name from the first = when the value contains more", () => {
    expect(unpartitionedCookieDeletion("session=a=b=c; Path=/")).toBe(
      "session=; Path=/; Max-Age=0; Secure; SameSite=None",
    );
  });
});

/**
 * responseHeaders is what actually pairs the two: for every upstream cookie it
 * must emit the deletion first (so browsers without CHIPS, which share one jar
 * and ignore Partitioned, delete-then-set rather than set-then-delete) and the
 * rewritten cookie second — always as an array, even for one cookie.
 */
const responseHeadersFactory = new Function(
  [
    "const targetPort = 3000;",
    extractFunctionSource("function rewriteLocationHeader(value, route) {"),
    rewriteSetCookieSource,
    unpartitionedCookieDeletionSource,
    extractFunctionSource("function responseHeaders("),
    "return responseHeaders;",
  ].join("\n"),
);
const responseHeaders: (
  headers: Record<string, string | string[] | undefined>,
  injectsHtml: boolean,
  addCors: boolean,
  rewriteCookies: boolean,
  route: {
    port: number;
    path: string;
    injects: boolean;
    tabPrefix: string | null;
  },
) => Record<string, string | string[]> = responseHeadersFactory();

/** The default (non-tab) dev-server route every cookie case runs on. */
const DEV_ROUTE = { port: 3000, path: "/", injects: true, tabPrefix: null };

describe("previewProxy responseHeaders Set-Cookie pairing", () => {
  test("emits the unpartitioned deletion before the rewritten cookie", () => {
    const headers = responseHeaders(
      { "set-cookie": ["sid=abc; Path=/; SameSite=Lax"] },
      false,
      false,
      true,
      DEV_ROUTE,
    );
    expect(headers["set-cookie"]).toEqual([
      "sid=; Path=/; Max-Age=0; Secure; SameSite=None",
      "sid=abc; Path=/; Secure; SameSite=None; Partitioned",
    ]);
  });

  test("a single string cookie still yields the pair as an array", () => {
    const headers = responseHeaders(
      { "set-cookie": "sid=abc; Path=/; SameSite=Lax" },
      false,
      false,
      true,
      DEV_ROUTE,
    );
    expect(headers["set-cookie"]).toEqual([
      "sid=; Path=/; Max-Age=0; Secure; SameSite=None",
      "sid=abc; Path=/; Secure; SameSite=None; Partitioned",
    ]);
  });

  test("keeps each cookie's deletion next to its own rewrite", () => {
    const headers = responseHeaders(
      {
        "set-cookie": [
          "sid=abc; Path=/; SameSite=Lax",
          "csrf=xyz; Path=/api; HttpOnly",
        ],
      },
      false,
      false,
      true,
      DEV_ROUTE,
    );
    expect(headers["set-cookie"]).toEqual([
      "sid=; Path=/; Max-Age=0; Secure; SameSite=None",
      "sid=abc; Path=/; Secure; SameSite=None; Partitioned",
      "csrf=; Path=/api; Max-Age=0; Secure; SameSite=None",
      "csrf=xyz; Path=/api; HttpOnly; Secure; SameSite=None; Partitioned",
    ]);
  });

  test("loopback clients (rewriteCookies false) see the header untouched", () => {
    const headers = responseHeaders(
      { "set-cookie": ["sid=abc; Path=/; SameSite=Lax"] },
      false,
      false,
      false,
      DEV_ROUTE,
    );
    expect(headers["set-cookie"]).toEqual(["sid=abc; Path=/; SameSite=Lax"]);
  });
});

/**
 * Cookies the previewed app writes with document.cookie (e.g. the Supabase
 * browser client) never reach responseHeaders, so the injected script applies
 * the identical attribute rules in the page — reusing the proxy's own two
 * functions via toString() rather than a second copy that could drift.
 */
const installPartitionedDocumentCookieSource = extractFunctionSource(
  "function installPartitionedDocumentCookie(rewrite, deletion) {",
);
const installFactory = new Function(
  `${installPartitionedDocumentCookieSource}\nreturn installPartitionedDocumentCookie;`,
);
const installPartitionedDocumentCookie: (
  rewrite: (value: string) => string,
  deletion: (value: string) => string,
) => void = installFactory();

/** Records every raw write reaching the original document.cookie setter. */
function fakeDocumentClass(writes: string[]): new () => { cookie: string } {
  class FakeDocument {
    declare cookie: string;
  }
  Object.defineProperty(FakeDocument.prototype, "cookie", {
    configurable: true,
    enumerable: false,
    get(): string {
      return "";
    },
    set(value: string): void {
      writes.push(String(value));
    },
  });
  return FakeDocument;
}

describe("previewProxy installPartitionedDocumentCookie", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "Document");
  });

  test("deletes the unpartitioned copy then sets the partitioned one", () => {
    const writes: string[] = [];
    Reflect.set(globalThis, "window", {
      location: { hostname: "preview.vercel.run" },
    });
    const FakeDocument = fakeDocumentClass(writes);
    Reflect.set(globalThis, "Document", FakeDocument);

    installPartitionedDocumentCookie(
      rewriteSetCookie,
      unpartitionedCookieDeletion,
    );
    new FakeDocument().cookie = "sb-token=abc; path=/";

    expect(writes).toEqual([
      "sb-token=; Path=/; Max-Age=0; Secure; SameSite=None",
      "sb-token=abc; path=/; Secure; SameSite=None; Partitioned",
    ]);
  });

  test("leaves in-sandbox (loopback-served) pages untouched", () => {
    const writes: string[] = [];
    Reflect.set(globalThis, "window", {
      location: { hostname: "localhost" },
    });
    const FakeDocument = fakeDocumentClass(writes);
    Reflect.set(globalThis, "Document", FakeDocument);

    installPartitionedDocumentCookie(
      rewriteSetCookie,
      unpartitionedCookieDeletion,
    );
    new FakeDocument().cookie = "sb-token=abc; path=/";

    expect(writes).toEqual(["sb-token=abc; path=/"]);
  });
});

describe("previewProxy document.cookie patch wiring", () => {
  test("the patch is built from the proxy's own cookie functions", () => {
    expect(proxySource).toContain(
      "installPartitionedDocumentCookie.toString()",
    );
    expect(proxySource).toContain("rewriteSetCookie.toString()");
    expect(proxySource).toContain("unpartitionedCookieDeletion.toString()");
  });

  test("the patch runs before the other injected scripts", () => {
    const buildInjectionTagSource = extractFunctionSource(
      "function buildInjectionTag() {",
    );
    const patchAt = buildInjectionTagSource.indexOf("cookiePatchScript");
    const convexAt = buildInjectionTagSource.indexOf("convexRewriteScript");
    expect(patchAt).toBeGreaterThanOrEqual(0);
    expect(convexAt).toBeGreaterThan(patchAt);
  });
});
