// The installer runs against a fake global: no network, no device.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { installUnhandledRejectionLogging, resetUnhandledRejectionLoggingForTests } from "./unhandledRejections.ts";

function fakeEnv() {
  const handlers = { tracker: null, global: null, previous: mock.fn() };
  const env = {
    HermesInternal: { enablePromiseRejectionTracker: (options) => { handlers.tracker = options; } },
    ErrorUtils: { getGlobalHandler: () => handlers.previous, setGlobalHandler: (h) => { handlers.global = h; } },
  };
  return { env, handlers };
}

test("registers without throwing, once", () => {
  resetUnhandledRejectionLoggingForTests();
  const { env, handlers } = fakeEnv();
  assert.equal(installUnhandledRejectionLogging(env), true);
  assert.equal(installUnhandledRejectionLogging(env), false);
  assert.equal(typeof handlers.tracker.onUnhandled, "function");
  assert.equal(handlers.tracker.allRejections, true);
});

test("unhandled rejections and uncaught errors reach console.error, message capped", () => {
  resetUnhandledRejectionLoggingForTests();
  const { env, handlers } = fakeEnv();
  installUnhandledRejectionLogging(env);
  const spy = mock.method(console, "error", () => {});
  handlers.tracker.onUnhandled(1, new TypeError("x".repeat(500)));
  handlers.global(new Error("boom"), true);
  spy.mock.restore();
  assert.equal(spy.mock.calls.length, 2);
  assert.equal(spy.mock.calls[0].arguments[1].kind, "unhandled-rejection");
  assert.equal(spy.mock.calls[0].arguments[1].errorMessage.length, 200);
  assert.equal(handlers.previous.mock.calls.length, 1);
});

test("an empty global does not throw", () => {
  resetUnhandledRejectionLoggingForTests();
  assert.doesNotThrow(() => installUnhandledRejectionLogging({}));
});

test("a fatal error is handed to onFatal first, then closes the app as before", async () => {
  resetUnhandledRejectionLoggingForTests();
  const { env, handlers } = fakeEnv();
  const saved = [];
  installUnhandledRejectionLogging(env, { onFatal: async (report) => { saved.push(report); } });
  const spy = mock.method(console, "error", () => {});
  const error = new TypeError("boom");
  handlers.global(error, true);
  assert.equal(handlers.previous.mock.calls.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  spy.mock.restore();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "TypeError");
  assert.equal(saved[0].message, "boom");
  assert.equal(handlers.previous.mock.calls.length, 1);
  assert.deepEqual(handlers.previous.mock.calls[0].arguments, [error, true]);
});

test("a non-fatal error skips onFatal", () => {
  resetUnhandledRejectionLoggingForTests();
  const { env, handlers } = fakeEnv();
  const onFatal = mock.fn(async () => {});
  installUnhandledRejectionLogging(env, { onFatal });
  const spy = mock.method(console, "error", () => {});
  handlers.global(new Error("soft"), false);
  spy.mock.restore();
  assert.equal(onFatal.mock.calls.length, 0);
  assert.equal(handlers.previous.mock.calls.length, 1);
});
