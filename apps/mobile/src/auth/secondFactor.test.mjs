// Unit tests for the second-factor helpers. The Clerk `signIn` is a mock:
// no network and no real sign-in.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  needsPrepare,
  pickSecondFactor,
  prepareSecondFactor,
  SECOND_FACTOR_MESSAGES,
  secondFactorCopy,
  submitSecondFactor,
} from "./secondFactor.ts";

const noopSetActive = async () => {};

function mockSignIn({ factors = null, attempt, prepare } = {}) {
  const calls = { attempt: [], prepare: [] };
  return {
    calls,
    supportedSecondFactors: factors,
    attemptSecondFactor: async (params) => {
      calls.attempt.push(params);
      return attempt ? attempt(params) : { status: "complete", createdSessionId: "sess_123" };
    },
    prepareSecondFactor: async (params) => {
      calls.prepare.push(params);
      if (prepare) return prepare(params);
      return {};
    },
  };
}

function recordSetActive() {
  const activated = [];
  return { activated, setActive: async (params) => void activated.push(params) };
}

test("totp happy path: attempts, then sets the session, with no prepare", async () => {
  const signIn = mockSignIn({ factors: [{ strategy: "totp" }] });
  const factor = pickSecondFactor(signIn.supportedSecondFactors);
  const { activated, setActive } = recordSetActive();

  assert.deepEqual(await prepareSecondFactor({ signIn, factor }), { ok: true });
  const result = await submitSecondFactor({ signIn, setActive, factor, code: "123456" });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(signIn.calls.prepare, []);
  assert.deepEqual(signIn.calls.attempt, [{ strategy: "totp", code: "123456" }]);
  assert.deepEqual(activated, [{ session: "sess_123" }]);
});

test("totp wrong code: returns the Clerk message and sets no session", async () => {
  const signIn = mockSignIn({
    attempt: () => {
      throw { errors: [{ code: "form_code_incorrect", message: "is incorrect", longMessage: "Incorrect code" }] };
    },
  });
  const { activated, setActive } = recordSetActive();
  const result = await submitSecondFactor({ signIn, setActive, factor: { strategy: "totp" }, code: "000000" });

  assert.deepEqual(result, { ok: false, error: "Incorrect code" });
  assert.deepEqual(activated, []);
});

test("unknown failure and provider-named messages use the generic message", async () => {
  const network = mockSignIn({ attempt: () => Promise.reject(new Error("fetch failed")) });
  const branded = mockSignIn({
    attempt: () => {
      throw { errors: [{ longMessage: "Clerk could not verify" }] };
    },
  });
  for (const signIn of [network, branded]) {
    const result = await submitSecondFactor({
      signIn,
      setActive: noopSetActive,
      factor: { strategy: "totp" },
      code: "111111",
    });
    assert.deepEqual(result, { ok: false, error: SECOND_FACTOR_MESSAGES.invalidCode });
  }
});

test("a status that is not complete reports the another-step message", async () => {
  const signIn = mockSignIn({ attempt: () => ({ status: "needs_new_password", createdSessionId: null }) });
  const result = await submitSecondFactor({
    signIn,
    setActive: noopSetActive,
    factor: { strategy: "totp" },
    code: "111111",
  });
  assert.deepEqual(result, { ok: false, error: SECOND_FACTOR_MESSAGES.needsAnotherStep });
});

test("complete without a session id does not call setActive", async () => {
  const signIn = mockSignIn({ attempt: () => ({ status: "complete", createdSessionId: null }) });
  const { activated, setActive } = recordSetActive();
  const result = await submitSecondFactor({ signIn, setActive, factor: { strategy: "totp" }, code: "111111" });
  assert.equal(result.ok, false);
  assert.deepEqual(activated, []);
});

test("setActive failure is returned, not thrown", async () => {
  const signIn = mockSignIn();
  const result = await submitSecondFactor({
    signIn,
    factor: { strategy: "totp" },
    code: "123456",
    setActive: async () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(result, { ok: false, error: SECOND_FACTOR_MESSAGES.invalidCode });
});

test("pickSecondFactor prefers totp when several factors exist", () => {
  const factors = [
    { strategy: "phone_code", phoneNumberId: "idn_p", safeIdentifier: "+44 ••••" },
    { strategy: "backup_code" },
    { strategy: "totp" },
  ];
  assert.deepEqual(pickSecondFactor(factors), { strategy: "totp" });
});

test("pickSecondFactor without totp uses Clerk order and reads the ids", () => {
  const factors = [
    { strategy: "email_link", emailAddressId: "idn_l" },
    { strategy: "email_code", emailAddressId: "idn_e" },
    { strategy: "phone_code", phoneNumberId: "idn_p" },
  ];
  assert.deepEqual(pickSecondFactor(factors), { strategy: "email_code", emailAddressId: "idn_e" });
  assert.deepEqual(pickSecondFactor(factors.slice(2)), { strategy: "phone_code", phoneNumberId: "idn_p" });
  assert.deepEqual(pickSecondFactor([{ strategy: "backup_code" }]), { strategy: "backup_code" });
});

test("pickSecondFactor: empty list falls back to totp, an unsupported-only list returns undefined", () => {
  assert.deepEqual(pickSecondFactor(null), { strategy: "totp" });
  assert.deepEqual(pickSecondFactor([]), { strategy: "totp" });
  assert.equal(pickSecondFactor([{ strategy: "email_link", emailAddressId: "idn_l" }]), undefined);
  // A phone factor with no id cannot be prepared, so it is skipped.
  assert.equal(pickSecondFactor([{ strategy: "phone_code" }]), undefined);
});

test("backup_code: attempts with the backup strategy and sets the session", async () => {
  const signIn = mockSignIn({ factors: [{ strategy: "backup_code" }] });
  const factor = pickSecondFactor(signIn.supportedSecondFactors);
  const { activated, setActive } = recordSetActive();
  const result = await submitSecondFactor({ signIn, setActive, factor, code: "abcd1234" });

  assert.deepEqual(result, { ok: true });
  assert.equal(needsPrepare(factor), false);
  assert.deepEqual(signIn.calls.prepare, []);
  assert.deepEqual(signIn.calls.attempt, [{ strategy: "backup_code", code: "abcd1234" }]);
  assert.deepEqual(activated, [{ session: "sess_123" }]);
});

test("email_code: prepare, resend, then attempt", async () => {
  const signIn = mockSignIn({ factors: [{ strategy: "email_code", emailAddressId: "idn_e" }] });
  const factor = pickSecondFactor(signIn.supportedSecondFactors);
  const { activated, setActive } = recordSetActive();

  assert.equal(needsPrepare(factor), true);
  assert.deepEqual(await prepareSecondFactor({ signIn, factor }), { ok: true });
  assert.deepEqual(await prepareSecondFactor({ signIn, factor }), { ok: true }); // Resend
  const result = await submitSecondFactor({ signIn, setActive, factor, code: "654321" });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(signIn.calls.prepare, [
    { strategy: "email_code", emailAddressId: "idn_e" },
    { strategy: "email_code", emailAddressId: "idn_e" },
  ]);
  assert.deepEqual(signIn.calls.attempt, [{ strategy: "email_code", code: "654321" }]);
  assert.deepEqual(activated, [{ session: "sess_123" }]);
});

test("phone_code: prepare passes phoneNumberId, then attempt", async () => {
  const signIn = mockSignIn({ factors: [{ strategy: "phone_code", phoneNumberId: "idn_p" }] });
  const factor = pickSecondFactor(signIn.supportedSecondFactors);
  const { activated, setActive } = recordSetActive();

  await prepareSecondFactor({ signIn, factor });
  const result = await submitSecondFactor({ signIn, setActive, factor, code: "222222" });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(signIn.calls.prepare, [{ strategy: "phone_code", phoneNumberId: "idn_p" }]);
  assert.deepEqual(signIn.calls.attempt, [{ strategy: "phone_code", code: "222222" }]);
  assert.deepEqual(activated, [{ session: "sess_123" }]);
});

test("prepare failure returns the Clerk message or the send-failed fallback; never throws", async () => {
  const factor = { strategy: "phone_code", phoneNumberId: "idn_p" };
  const limited = mockSignIn({
    prepare: () => {
      throw { errors: [{ longMessage: "Too many requests. Try again later." }] };
    },
  });
  const down = mockSignIn({ prepare: () => Promise.reject(new Error("offline")) });

  assert.deepEqual(await prepareSecondFactor({ signIn: limited, factor }), {
    ok: false,
    error: "Too many requests. Try again later.",
  });
  assert.deepEqual(await prepareSecondFactor({ signIn: down, factor }), {
    ok: false,
    error: SECOND_FACTOR_MESSAGES.sendFailed,
  });
});

test("copy: each strategy has its own title, and only totp, phone and email are numeric", () => {
  const titles = [
    { strategy: "totp" },
    { strategy: "backup_code" },
    { strategy: "phone_code", phoneNumberId: "a" },
    { strategy: "email_code", emailAddressId: "b" },
  ].map((factor) => secondFactorCopy(factor));
  assert.equal(new Set(titles.map((copy) => copy.title)).size, 4);
  assert.deepEqual(
    titles.map((copy) => copy.numeric),
    [true, false, true, true],
  );
  for (const copy of titles) assert.doesNotMatch(`${copy.title} ${copy.description}`, /clerk|convex/i);
});
