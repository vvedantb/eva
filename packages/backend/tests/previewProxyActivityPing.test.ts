import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { SANDBOX_ENGAGEMENT_INPUT_EVENTS } from "@eva/shared";
import {
  extractFunctionSource,
  previewProxySource,
} from "./_helpers/previewProxySource";

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

  test("a visible page nobody touches pings once, for the page load", () => {
    const page = loadPage("visible");
    expect(page.pings()).toBe(1);

    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(page.pings()).toBe(1);
  });

  test("the ping stops one heartbeat after the last input", () => {
    const page = loadPage("visible");
    vi.advanceTimersByTime(HEARTBEAT_MS / 2);
    page.input("pointermove");
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(page.pings()).toBe(2);

    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(page.pings()).toBe(2);
  });

  test("steady input pings once per heartbeat, not once per event", () => {
    const page = loadPage("visible");
    for (let second = 0; second < (3 * HEARTBEAT_MS) / 1000; second += 1) {
      vi.advanceTimersByTime(1000);
      page.input("pointermove");
    }
    expect(page.pings()).toBe(4);
  });

  test("input on an idle page pings at once", () => {
    const page = loadPage("visible");
    vi.advanceTimersByTime(5 * HEARTBEAT_MS);
    expect(page.pings()).toBe(1);

    page.input("pointerdown");
    expect(page.pings()).toBe(2);
  });

  test("a hidden page never pings, even with input", () => {
    const page = loadPage("hidden");
    page.input("keydown");
    vi.advanceTimersByTime(10 * HEARTBEAT_MS);
    expect(page.pings()).toBe(0);
  });
});
