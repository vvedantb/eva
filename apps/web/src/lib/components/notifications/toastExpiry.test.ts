import { expect, test } from "vitest";
import { nextToastExpiryDelay } from "./toastExpiry";

test("empty tray needs no timer", () => {
  expect(nextToastExpiryDelay([], 1_000)).toBeNull();
});

test("sleeps until the soonest expiry, not on a 500ms poll", () => {
  expect(nextToastExpiryDelay([1_400, 1_900], 1_000)).toBe(400);
});

test("a toast that already expired is removed on the next turn", () => {
  expect(nextToastExpiryDelay([900], 1_000)).toBe(0);
});
