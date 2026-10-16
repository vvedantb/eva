import { expect, test } from "vitest";
import {
  INCOMPLETE_PR_RECAP_ERROR,
  isIncompleteReadyRecap,
  isViewableRecap,
  resolvePrRecapWrite,
} from "../convex/_prRecapWorkflow/recapState";

test("a ready write without a walkthrough is stored as an error", () => {
  expect(
    resolvePrRecapWrite({
      prRecapStatus: "ready",
      html: undefined,
      prRecapError: undefined,
    }),
  ).toEqual({
    prRecapStatus: "error",
    prRecapError: INCOMPLETE_PR_RECAP_ERROR,
  });
  // Whitespace is not a walkthrough either.
  expect(
    resolvePrRecapWrite({
      prRecapStatus: "ready",
      html: "  \n ",
      prRecapError: undefined,
    }).prRecapStatus,
  ).toBe("error");
});

test("a rejected ready write keeps the caller's own error text", () => {
  expect(
    resolvePrRecapWrite({
      prRecapStatus: "ready",
      html: "",
      prRecapError: "Sandbox died",
    }),
  ).toEqual({ prRecapStatus: "error", prRecapError: "Sandbox died" });
});

test("a genuine ready write drops stale error text", () => {
  expect(
    resolvePrRecapWrite({
      prRecapStatus: "ready",
      html: "<!doctype html><html></html>",
      prRecapError: "an earlier failure",
    }),
  ).toEqual({ prRecapStatus: "ready", prRecapError: undefined });
});

test("pending and error writes pass through untouched", () => {
  expect(
    resolvePrRecapWrite({
      prRecapStatus: "pending",
      html: undefined,
      prRecapError: undefined,
    }),
  ).toEqual({ prRecapStatus: "pending", prRecapError: undefined });
  expect(
    resolvePrRecapWrite({
      prRecapStatus: "error",
      html: "<html></html>",
      prRecapError: "boom",
    }),
  ).toEqual({ prRecapStatus: "error", prRecapError: "boom" });
});

test("the views agree on which stored rows are viewable", () => {
  const ready = { prRecapStatus: "ready", html: "<html></html>" } as const;
  const legacy = { prRecapStatus: "ready", html: "" } as const;
  expect(isViewableRecap(ready)).toBe(true);
  expect(isIncompleteReadyRecap(ready)).toBe(false);
  expect(isViewableRecap(legacy)).toBe(false);
  expect(isIncompleteReadyRecap(legacy)).toBe(true);
  // Structured steps are a walkthrough on their own; older rows keep HTML.
  const steps = [{ title: "One", summary: "First.", files: [] }];
  expect(
    isViewableRecap({ prRecapStatus: "ready", recapWalkthrough: steps }),
  ).toBe(true);
  expect(
    isIncompleteReadyRecap({ prRecapStatus: "ready", recapWalkthrough: [] }),
  ).toBe(true);
  // A pending or errored doc is neither viewable nor "incomplete ready".
  expect(isIncompleteReadyRecap({ prRecapStatus: "pending" })).toBe(false);
  expect(isViewableRecap({ prRecapStatus: "error" })).toBe(false);
});
