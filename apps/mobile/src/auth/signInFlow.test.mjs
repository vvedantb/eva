// Unit tests for the sign-in flow. The Clerk `signIn` is a mock: no network
// and no real sign-in.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clerkErrorMessage,
  nextStep,
  sendCode,
  SIGN_IN_MESSAGES,
  startSignIn,
  submitCode,
  submitNewPassword,
  warnUnsupported,
} from "./signInFlow.ts";

const resource = (over = {}) => ({
  status: null,
  createdSessionId: null,
  supportedFirstFactors: null,
  supportedSecondFactors: null,
  ...over,
});

/** A mock sign-in that records calls and returns `next` from every method. */
function mockSignIn(over = {}, next = resource()) {
  const calls = [];
  const record = (name) => async (params) => {
    calls.push([name, params]);
    return next;
  };
  const signIn = {
    ...resource(over),
    calls,
    create: record("create"),
    prepareFirstFactor: record("prepareFirstFactor"),
    attemptFirstFactor: record("attemptFirstFactor"),
    prepareSecondFactor: record("prepareSecondFactor"),
    attemptSecondFactor: record("attemptSecondFactor"),
    resetPassword: record("resetPassword"),
  };
  return signIn;
}

function recorder() {
  const activated = [];
  return { activated, setActive: async (params) => void activated.push(params) };
}

const complete = resource({ status: "complete", createdSessionId: "sess_1" });

test("nextStep: complete with a session", () => {
  assert.deepEqual(nextStep(complete), { kind: "complete", sessionId: "sess_1" });
});

test("nextStep: complete without a session is unsupported", () => {
  assert.equal(nextStep(resource({ status: "complete" })).kind, "unsupported");
});

test("nextStep: needs_second_factor lists code factors, totp first, backup last, one per strategy", () => {
  const step = nextStep(
    resource({
      status: "needs_second_factor",
      supportedSecondFactors: [
        { strategy: "backup_code" },
        { strategy: "phone_code", phoneNumberId: "idn_p1" },
        { strategy: "phone_code", phoneNumberId: "idn_p2" },
        { strategy: "email_code", emailAddressId: "idn_e1" },
        { strategy: "totp" },
        { strategy: "email_link", emailAddressId: "idn_e1" },
      ],
    }),
  );
  assert.equal(step.kind, "code");
  assert.equal(step.phase, "second");
  assert.deepEqual(
    step.factors.map((f) => f.strategy),
    ["totp", "email_code", "phone_code", "backup_code"],
  );
  assert.equal(step.factors[2].phoneNumberId, "idn_p1");
});

test("nextStep: needs_client_trust uses email or phone code only", () => {
  const step = nextStep(
    resource({
      status: "needs_client_trust",
      supportedSecondFactors: [{ strategy: "totp" }, { strategy: "email_code", emailAddressId: "idn_e1" }],
    }),
  );
  assert.equal(step.kind, "code");
  assert.equal(step.phase, "second");
  assert.deepEqual(step.factors.map((f) => f.strategy), ["email_code"]);
});

test("nextStep: needs_first_factor with email_code, ignoring password and others", () => {
  const step = nextStep(
    resource({
      status: "needs_first_factor",
      supportedFirstFactors: [{ strategy: "password" }, { strategy: "email_code", emailAddressId: "idn_e1" }],
    }),
  );
  assert.equal(step.kind, "code");
  assert.equal(step.phase, "first");
  assert.deepEqual(step.factors.map((f) => f.strategy), ["email_code"]);
});

test("nextStep: needs_new_password", () => {
  assert.deepEqual(nextStep(resource({ status: "needs_new_password" })), { kind: "new_password" });
});

test("nextStep: unsupported states carry the status and strategy names", () => {
  const link = nextStep(
    resource({ status: "needs_second_factor", supportedSecondFactors: [{ strategy: "email_link" }] }),
  );
  assert.deepEqual(link, { kind: "unsupported", status: "needs_second_factor", strategies: ["email_link"] });
  const identifier = nextStep(resource({ status: "needs_identifier" }));
  assert.deepEqual(identifier, { kind: "unsupported", status: "needs_identifier", strategies: [] });
  const noStatus = nextStep(resource());
  assert.equal(noStatus.status, "none");
});

test("warnUnsupported logs the status and strategy names only", () => {
  const logged = [];
  const original = console.warn;
  console.warn = (message) => logged.push(message);
  try {
    warnUnsupported({ kind: "unsupported", status: "needs_second_factor", strategies: ["email_link", "passkey"] });
  } finally {
    console.warn = original;
  }
  assert.deepEqual(logged, ['[sign-in] unsupported status "needs_second_factor", strategies: email_link, passkey']);
});

test("startSignIn: complete sets the session", async () => {
  const { activated, setActive } = recorder();
  const signIn = mockSignIn({}, complete);
  const outcome = await startSignIn({ signIn, setActive, identifier: "a@b.test", password: "pw" });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.step.kind, "complete");
  assert.deepEqual(signIn.calls, [["create", { identifier: "a@b.test", password: "pw" }]]);
  assert.deepEqual(activated, [{ session: "sess_1" }]);
});

test("startSignIn: needs_second_factor returns the code step and sets no session", async () => {
  const { activated, setActive } = recorder();
  const next = resource({ status: "needs_second_factor", supportedSecondFactors: [{ strategy: "totp" }] });
  const outcome = await startSignIn({ signIn: mockSignIn({}, next), setActive, identifier: "a", password: "b" });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.step.kind, "code");
  assert.deepEqual(activated, []);
});

test("startSignIn: unsupported status warns and returns the unsupported step", async () => {
  const { setActive } = recorder();
  const next = resource({ status: "needs_identifier" });
  const original = console.warn;
  const logged = [];
  console.warn = (message) => logged.push(message);
  let outcome;
  try {
    outcome = await startSignIn({ signIn: mockSignIn({}, next), setActive, identifier: "a", password: "b" });
  } finally {
    console.warn = original;
  }
  assert.equal(outcome.step.kind, "unsupported");
  assert.equal(logged.length, 1);
});

test("startSignIn: a Clerk error gives its message; other errors give the fallback", async () => {
  const { setActive } = recorder();
  const wrong = mockSignIn();
  wrong.create = async () => {
    throw { errors: [{ longMessage: "Password is incorrect." }] };
  };
  assert.deepEqual(await startSignIn({ signIn: wrong, setActive, identifier: "a", password: "b" }), {
    ok: false,
    error: "Password is incorrect.",
  });
  const network = mockSignIn();
  network.create = async () => Promise.reject(new Error("fetch failed"));
  assert.deepEqual(await startSignIn({ signIn: network, setActive, identifier: "a", password: "b" }), {
    ok: false,
    error: SIGN_IN_MESSAGES.signInFailed,
  });
});

test("clerkErrorMessage never shows a message that names the provider", () => {
  assert.equal(clerkErrorMessage({ errors: [{ longMessage: "Clerk could not verify" }] }, "fallback"), "fallback");
  assert.equal(clerkErrorMessage(undefined, "fallback"), "fallback");
});

test("sendCode: second-factor email and phone call prepareSecondFactor with the factor id", async () => {
  const signIn = mockSignIn();
  await sendCode({ signIn, phase: "second", factor: { strategy: "email_code", emailAddressId: "idn_e1" } });
  await sendCode({ signIn, phase: "second", factor: { strategy: "phone_code", phoneNumberId: "idn_p1" } });
  assert.deepEqual(signIn.calls, [
    ["prepareSecondFactor", { strategy: "email_code", emailAddressId: "idn_e1" }],
    ["prepareSecondFactor", { strategy: "phone_code", phoneNumberId: "idn_p1" }],
  ]);
});

test("sendCode: first-factor email calls prepareFirstFactor; a missing id fails without a call", async () => {
  const signIn = mockSignIn();
  const sent = await sendCode({ signIn, phase: "first", factor: { strategy: "email_code", emailAddressId: "idn_e1" } });
  assert.deepEqual(sent, { ok: true });
  assert.deepEqual(signIn.calls, [["prepareFirstFactor", { strategy: "email_code", emailAddressId: "idn_e1" }]]);
  const missing = await sendCode({ signIn: mockSignIn(), phase: "first", factor: { strategy: "phone_code" } });
  assert.deepEqual(missing, { ok: false, error: SIGN_IN_MESSAGES.sendFailed });
});

test("sendCode: totp and backup_code send nothing", async () => {
  const signIn = mockSignIn();
  await sendCode({ signIn, phase: "second", factor: { strategy: "totp" } });
  await sendCode({ signIn, phase: "second", factor: { strategy: "backup_code" } });
  assert.deepEqual(signIn.calls, []);
});

test("sendCode: a failure returns the mapped message", async () => {
  const signIn = mockSignIn();
  signIn.prepareSecondFactor = async () => {
    throw { errors: [{ message: "Too many requests" }] };
  };
  const sent = await sendCode({ signIn, phase: "second", factor: { strategy: "email_code" } });
  assert.deepEqual(sent, { ok: false, error: "Too many requests" });
});

for (const strategy of ["totp", "backup_code", "phone_code", "email_code"]) {
  test(`submitCode second factor ${strategy}: attempts with the strategy and sets the session`, async () => {
    const { activated, setActive } = recorder();
    const signIn = mockSignIn({}, complete);
    const outcome = await submitCode({ signIn, setActive, phase: "second", strategy, code: "123456" });
    assert.equal(outcome.ok, true);
    assert.deepEqual(signIn.calls, [["attemptSecondFactor", { strategy, code: "123456" }]]);
    assert.deepEqual(activated, [{ session: "sess_1" }]);
  });
}

test("submitCode first factor email_code: attemptFirstFactor, then session", async () => {
  const { activated, setActive } = recorder();
  const signIn = mockSignIn({}, complete);
  const outcome = await submitCode({ signIn, setActive, phase: "first", strategy: "email_code", code: "654321" });
  assert.equal(outcome.ok, true);
  assert.deepEqual(signIn.calls, [["attemptFirstFactor", { strategy: "email_code", code: "654321" }]]);
  assert.deepEqual(activated, [{ session: "sess_1" }]);
});

test("submitCode first factor: a second factor may follow", async () => {
  const { activated, setActive } = recorder();
  const next = resource({ status: "needs_second_factor", supportedSecondFactors: [{ strategy: "totp" }] });
  const outcome = await submitCode({
    signIn: mockSignIn({}, next),
    setActive,
    phase: "first",
    strategy: "email_code",
    code: "111111",
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.step.phase, "second");
  assert.deepEqual(activated, []);
});

test("submitCode: a wrong code returns the mapped message and sets no session", async () => {
  const { activated, setActive } = recorder();
  const signIn = mockSignIn();
  signIn.attemptSecondFactor = async () => {
    throw { errors: [{ code: "form_code_incorrect", longMessage: "Incorrect code" }] };
  };
  const outcome = await submitCode({ signIn, setActive, phase: "second", strategy: "totp", code: "000000" });
  assert.deepEqual(outcome, { ok: false, error: "Incorrect code" });
  assert.deepEqual(activated, []);
});

test("submitCode: an unknown failure gives the generic message", async () => {
  const { setActive } = recorder();
  const signIn = mockSignIn();
  signIn.attemptSecondFactor = async () => Promise.reject(new Error("fetch failed"));
  const outcome = await submitCode({ signIn, setActive, phase: "second", strategy: "totp", code: "1" });
  assert.deepEqual(outcome, { ok: false, error: SIGN_IN_MESSAGES.invalidCode });
});

test("submitNewPassword: resetPassword then session", async () => {
  const { activated, setActive } = recorder();
  const signIn = mockSignIn({}, complete);
  const outcome = await submitNewPassword({ signIn, setActive, password: "new-pw" });
  assert.equal(outcome.ok, true);
  assert.deepEqual(signIn.calls, [["resetPassword", { password: "new-pw" }]]);
  assert.deepEqual(activated, [{ session: "sess_1" }]);
});

test("submitNewPassword: a failure returns the message", async () => {
  const { setActive } = recorder();
  const signIn = mockSignIn();
  signIn.resetPassword = async () => {
    throw { errors: [{ longMessage: "Password is too short." }] };
  };
  assert.deepEqual(await submitNewPassword({ signIn, setActive, password: "x" }), {
    ok: false,
    error: "Password is too short.",
  });
});
