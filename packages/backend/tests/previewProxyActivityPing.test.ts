import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  SANDBOX_ENGAGED_WINDOW_MS,
  SANDBOX_ENGAGEMENT_INPUT_EVENTS,
} from "@eva/shared";
import {
  extractFunctionSource,
  previewProxySource,
} from "./_helpers/previewProxySource";

/**
 * Regression guard for session 98, which stayed awake overnight: a proxied
 * page left visible on an unattended screen kept posting the on-screen ping.
 * The ping now needs a visible page AND input inside the engaged window.
 *
 * Runs the shipped ping function (lifted from the proxy template, with its
 * `${…}` placeholders filled the way the template fills them) against a stub
 * window/document, so a drift in the idle check fails here.
 */

const SIGNATURE = 'const visibilityPingScript = "(" + function () {';

const heartbeatMatch = previewProxySource.match(
  /const ACTIVITY_HEARTBEAT_INTERVAL_MS = ([\d_]+);/,
);
if (heartbeatMatch === null) {
  throw new Error("ACTIVITY_HEARTBEAT_INTERVAL_MS not found in previewProxy.ts");
}
const HEARTBEAT_MS = Number(heartbeatMatch[1].replaceAll("_", ""));

const pingFunctionSource = extractFunctionSource(SIGNATURE)
  .slice(SIGNATURE.indexOf("function () {"))
  .replaceAll("${SANDBOX_ENGAGED_WINDOW_MS}", String(SANDBOX_ENGAGED_WINDOW_MS))
  .replaceAll("${ACTIVITY_HEARTBEAT_INTERVAL_MS}", String(HEARTBEAT_MS))
  .replaceAll(
    "${JSON.stringify(SANDBOX_ENGAGEMENT_INPUT_EVENTS)}",
    JSON.stringify(SANDBOX_ENGAGEMENT_INPUT_EVENTS),
  );

const runPingScript = new Function(
  "window",
  "document",
  "fetch",
  `(${pingFunctionSource})();`,
);

type Listener = () => void;

function loadPage(visibilityState: "visible" | "hidden") {
  const windowListeners = new Map<string, Listener[]>();
  const documentListeners = new Map<string, Listener[]>();
  const add =
    (map: Map<string, Listener[]>) => (type: string, listener: Listener) => {
      map.set(type, [...(map.get(type) ?? []), listener]);
    };
  const fakeWindow = {
    location: { hostname: "sb-abc.vercel.run" },
    addEventListener: add(windowListeners),
    setInterval: (handler: Listener, ms: number) => setInterval(handler, ms),
  };
  const fakeDocument = {
    visibilityState,
    addEventListener: add(documentListeners),
  };
  const fetchSpy = vi.fn(() => Promise.resolve());
  runPingScript(fakeWindow, fakeDocument, fetchSpy);

  return {
    pings: () => fetchSpy.mock.calls.length,
    input: (type: string) => {
      for (const listener of windowListeners.get(type) ?? []) listener();
    },
  };
}

describe("on-screen activity ping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a visible page nobody touches stops pinging after the engaged window", () => {
    const page = loadPage("visible");
    expect(page.pings()).toBe(1);

    vi.advanceTimersByTime(SANDBOX_ENGAGED_WINDOW_MS);
    const pingsWhileEngaged = page.pings();
    expect(pingsWhileEngaged).toBeGreaterThan(1);

    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(page.pings()).toBe(pingsWhileEngaged);
  });

  test("input on an idle page pings at once and resumes the heartbeat", () => {
    const page = loadPage("visible");
    vi.advanceTimersByTime(SANDBOX_ENGAGED_WINDOW_MS + HEARTBEAT_MS);
    const idlePings = page.pings();

    page.input("pointerdown");
    expect(page.pings()).toBe(idlePings + 1);

    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(page.pings()).toBe(idlePings + 2);
  });

  test("a hidden page never pings, even with input", () => {
    const page = loadPage("hidden");
    page.input("keydown");
    vi.advanceTimersByTime(SANDBOX_ENGAGED_WINDOW_MS);
    expect(page.pings()).toBe(0);
  });
});
