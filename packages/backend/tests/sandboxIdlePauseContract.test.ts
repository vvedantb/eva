import { describe, expect, test } from "vitest";
import { extractFunctionSource } from "./_helpers/previewProxySource";

type Req = { headers: Record<string, string>; socket: { remoteAddress: string } };

const countsAsActivityFactory = new Function(
  [
    extractFunctionSource("function isLoopbackRequest(req) {"),
    extractFunctionSource("function isBrowserRequest(req) {"),
    extractFunctionSource("function countsAsActivity(req) {"),
    "return countsAsActivity;",
  ].join("\n\n"),
);

function request(headers: Record<string, string>, remoteAddress = "10.0.0.1"): Req {
  return { headers, socket: { remoteAddress } };
}

/**
 * Task 262 stayed awake for hours with nobody present: a hidden tab's polls
 * counted as a human. Session 98 later showed editor and desktop tabs had the
 * same hole. Browser traffic now never counts by itself on any proxy; only the
 * on-screen ping (visible + recent input) and non-browser callers do.
 */
describe("which proxy traffic resets the idle clock", () => {
  const counts = (req: Req): boolean => countsAsActivityFactory()(req);

  test("browser traffic does not count, on any proxy", () => {
    expect(counts(request({ "sec-fetch-mode": "cors" }))).toBe(false);
    expect(counts(request({ "sec-fetch-mode": "navigate" }))).toBe(false);
    expect(counts(request({ "sec-fetch-mode": "websocket" }))).toBe(false);
  });

  test("non-browser clients (API calls, webhooks) still count", () => {
    expect(counts(request({}))).toBe(true);
  });

  test("the agent's own loopback browser never counts", () => {
    expect(counts(request({}, "127.0.0.1"))).toBe(false);
  });
});
