// Unit tests for the TOTP second-factor helper. The Clerk `signIn` is a mock:
// no network and no real sign-in.
import assert from "node:assert/strict";
import { test } from "node:test";
import { submitTotpSecondFactor, TOTP_MESSAGES } from "./totp.ts";

const noopSetActive = async () => {};

test("needs_second_factor then complete: sets the session", async () => {
  const calls = [];
  const signIn = {
    status: "needs_second_factor",
    attemptSecondFactor: async (params) => {
      calls.push(params);
      return { status: "complete", createdSessionId: "sess_123" };
    },
  };
  const activated = [];
  const result = await submitTotpSecondFactor({
    signIn,
    code: "123456",
    setActive: async (params) => {
      activated.push(params);
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{ strategy: "totp", code: "123456" }]);
  assert.deepEqual(activated, [{ session: "sess_123" }]);
});

test("wrong code: returns the mapped Clerk message and does not set a session", async () => {
  const signIn = {
    attemptSecondFactor: async () => {
      throw { errors: [{ code: "form_code_incorrect", message: "is incorrect", longMessage: "Incorrect code" }] };
    },
  };
  let activated = false;
  const result = await submitTotpSecondFactor({
    signIn,
    code: "000000",
    setActive: async () => {
      activated = true;
    },
  });

  assert.deepEqual(result, { ok: false, error: "Incorrect code" });
  assert.equal(activated, false);
});

test("unknown failure and provider-named messages fall back to the generic message", async () => {
  const network = { attemptSecondFactor: async () => Promise.reject(new Error("fetch failed")) };
  const branded = {
    attemptSecondFactor: async () => {
      throw { errors: [{ longMessage: "Clerk could not verify" }] };
    },
  };
  const results = await Promise.all(
    [network, branded].map((signIn) => submitTotpSecondFactor({ signIn, code: "111111", setActive: noopSetActive })),
  );
  for (const result of results) assert.deepEqual(result, { ok: false, error: TOTP_MESSAGES.invalidCode });
});

test("a status that is not complete reports the another-step message", async () => {
  const signIn = { attemptSecondFactor: async () => ({ status: "needs_new_password", createdSessionId: null }) };
  const result = await submitTotpSecondFactor({ signIn, code: "111111", setActive: noopSetActive });
  assert.deepEqual(result, { ok: false, error: TOTP_MESSAGES.needsAnotherStep });
});
