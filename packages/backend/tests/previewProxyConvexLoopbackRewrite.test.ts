import { beforeEach, describe, expect, test } from "bun:test";
import { extractFunctionSource } from "./_helpers/previewProxySource";

/**
 * Guards the loopback-Convex rewrite injected into preview pages. A sandbox's
 * local Convex backend mints absolute URLs from its own origin, so
 * storage.generateUploadUrl() / storage.getUrl() hand the browser
 * http://127.0.0.1:3210/… addresses only the sandbox itself can reach —
 * uploads from the preview fail with a network error (reported on
 * eProcurement). The injected script must divert fetch/XHR/WebSocket calls
 * and src/href attributes onto the authenticated /__convex and /__convex-site
 * prefixes of the page's own origin, and leave every other URL alone.
 */

const source = extractFunctionSource(
  'const convexRewriteScript = "(" + function () {',
);
const iifeSource = `(${source.slice(source.indexOf("function"))})();`;

interface StubElement {
  attrs: Record<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): StubElement[];
}

function makeElement(attrs: Record<string, string>): StubElement {
  return {
    attrs: { ...attrs },
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    querySelectorAll() {
      return [];
    },
  };
}

interface FetchCall {
  input: string;
  init: unknown;
}

type MutationRecordStub =
  | { type: "attributes"; target: StubElement; attributeName: string }
  | { type: "childList"; addedNodes: StubElement[] };

interface Harness {
  fetchCalls: FetchCall[];
  xhrCalls: string[];
  wsCalls: { url: string; protocols: unknown }[];
  fetch(input: unknown, init?: unknown): void;
  makeRequest(url: string): unknown;
  openXhr(url: string): void;
  openWebSocket(url: string, protocols?: string[]): void;
  emitMutations(records: MutationRecordStub[]): void;
  seededElements: StubElement[];
}

function runInjectedScript(pageHref: string): Harness {
  const fetchCalls: FetchCall[] = [];
  const xhrCalls: string[] = [];
  const wsCalls: { url: string; protocols: unknown }[] = [];

  class RequestStub {
    url: string;
    constructor(url: string | URL | RequestStub, _init?: unknown) {
      this.url =
        typeof url === "string" || url instanceof URL
          ? String(url)
          : url.url;
    }
  }

  class XhrStub {
    open(_method: string, url: string): void {
      xhrCalls.push(String(url));
    }
  }

  class WebSocketStub {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url: string, protocols?: unknown) {
      wsCalls.push({ url: String(url), protocols });
    }
  }

  let mutationCallback: (records: MutationRecordStub[]) => void = () => {};
  class MutationObserverStub {
    constructor(callback: (records: MutationRecordStub[]) => void) {
      mutationCallback = callback;
    }
    observe(): void {}
  }

  const seededElements = [
    makeElement({ src: "http://127.0.0.1:3210/api/storage/img-id" }),
    makeElement({ href: "http://localhost:3210/api/storage/doc-id?x=1" }),
    makeElement({ href: "/relative" }),
    makeElement({ src: "https://cdn.example.com/app.js" }),
  ];

  const documentStub = {
    documentElement: makeElement({}),
    querySelectorAll(): StubElement[] {
      return seededElements;
    },
  };

  interface WindowStub {
    location: URL;
    fetch(input: unknown, init?: unknown): void;
    WebSocket: typeof WebSocketStub;
  }

  const windowStub: WindowStub = {
    location: new URL(pageHref),
    fetch(input, init) {
      fetchCalls.push({
        input: input instanceof RequestStub ? input.url : String(input),
        init,
      });
    },
    WebSocket: WebSocketStub,
  };

  const run = new Function(
    "window",
    "Request",
    "XMLHttpRequest",
    "MutationObserver",
    "document",
    iifeSource,
  );
  run(windowStub, RequestStub, XhrStub, MutationObserverStub, documentStub);

  return {
    fetchCalls,
    xhrCalls,
    wsCalls,
    fetch: (input, init) => windowStub.fetch(input, init),
    makeRequest: (url) => new RequestStub(url),
    openXhr: (url) => new XhrStub().open("GET", url),
    openWebSocket: (url, protocols) =>
      protocols === undefined
        ? new windowStub.WebSocket(url)
        : new windowStub.WebSocket(url, protocols),
    emitMutations: (records) => mutationCallback(records),
    seededElements,
  };
}

const PAGE = "https://sandy-3000.vercel.run/some/page";

describe("previewProxy convex loopback rewrite", () => {
  let harness: Harness;
  beforeEach(() => {
    harness = runInjectedScript(PAGE);
  });

  test("rewrites a generateUploadUrl fetch onto /__convex (the upload bug)", () => {
    harness.fetch("http://127.0.0.1:3210/api/storage/upload?token=abc", {
      method: "POST",
    });
    expect(harness.fetchCalls[0]?.input).toBe(
      "https://sandy-3000.vercel.run/__convex/api/storage/upload?token=abc",
    );
    expect(harness.fetchCalls[0]?.init).toEqual({ method: "POST" });
  });

  test("rewrites Request-object fetches by cloning onto the new URL", () => {
    harness.fetch(
      harness.makeRequest("http://localhost:3210/api/storage/upload?token=t"),
    );
    expect(harness.fetchCalls[0]?.input).toBe(
      "https://sandy-3000.vercel.run/__convex/api/storage/upload?token=t",
    );
  });

  test("leaves non-Convex and relative fetches alone", () => {
    harness.fetch("http://127.0.0.1:9999/x");
    harness.fetch("https://api.example.com/x");
    harness.fetch("/api/local");
    expect(harness.fetchCalls.map((c) => c.input)).toEqual([
      "http://127.0.0.1:9999/x",
      "https://api.example.com/x",
      "/api/local",
    ]);
  });

  test("rewrites XHR to the HTTP-actions port onto /__convex-site", () => {
    harness.openXhr("http://127.0.0.1:3211/some-action?q=1");
    expect(harness.xhrCalls[0]).toBe(
      "https://sandy-3000.vercel.run/__convex-site/some-action?q=1",
    );
  });

  test("rewrites the Convex sync WebSocket and keeps subprotocols", () => {
    harness.openWebSocket("ws://127.0.0.1:3210/api/1.28.0/sync", ["p1"]);
    expect(harness.wsCalls[0]).toEqual({
      url: "wss://sandy-3000.vercel.run/__convex/api/1.28.0/sync",
      protocols: ["p1"],
    });
  });

  test("leaves other WebSockets alone", () => {
    harness.openWebSocket("wss://other.example/ws");
    expect(harness.wsCalls[0]?.url).toBe("wss://other.example/ws");
  });

  test("rewrites storage URLs already in the DOM (img src, a href)", () => {
    expect(harness.seededElements[0]?.attrs.src).toBe(
      "https://sandy-3000.vercel.run/__convex/api/storage/img-id",
    );
    expect(harness.seededElements[1]?.attrs.href).toBe(
      "https://sandy-3000.vercel.run/__convex/api/storage/doc-id?x=1",
    );
    expect(harness.seededElements[2]?.attrs.href).toBe("/relative");
    expect(harness.seededElements[3]?.attrs.src).toBe(
      "https://cdn.example.com/app.js",
    );
  });

  test("rewrites nodes and attribute changes observed after load", () => {
    const late = makeElement({ src: "http://127.0.0.1:3211/site-asset" });
    harness.emitMutations([{ type: "childList", addedNodes: [late] }]);
    expect(late.attrs.src).toBe(
      "https://sandy-3000.vercel.run/__convex-site/site-asset",
    );

    const changed = makeElement({
      href: "http://127.0.0.1:3210/api/storage/late-id",
    });
    harness.emitMutations([
      { type: "attributes", target: changed, attributeName: "href" },
    ]);
    expect(changed.attrs.href).toBe(
      "https://sandy-3000.vercel.run/__convex/api/storage/late-id",
    );
  });

  test("does nothing on loopback pages (in-sandbox agent browser)", () => {
    const loopback = runInjectedScript("http://127.0.0.1:3000/page");
    loopback.fetch("http://127.0.0.1:3210/api/storage/upload?token=abc");
    expect(loopback.fetchCalls[0]?.input).toBe(
      "http://127.0.0.1:3210/api/storage/upload?token=abc",
    );
    expect(loopback.seededElements[0]?.attrs.src).toBe(
      "http://127.0.0.1:3210/api/storage/img-id",
    );
  });
});
