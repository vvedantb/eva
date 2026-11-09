// Unit tests for the sign-in flow. The Clerk `signIn` is a mock: no network
// and no real sign-in.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  failureMessage,
  nextStep,
  sendCode,
  SIGN_IN_MESSAGES,
  SIGN_IN_STAGE_TIMEOUT_MS,
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

/** Runs `fn` with console.error captured. */
async function captureErrors(fn) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    return { result: await fn(), logged };
  } finally {
    console.error = original;
  }
}

const PASSWORD = "s3cret-pw-value";

async function signInWith(create, setActive = recorder().setActive) {
  const signIn = mockSignIn();
  signIn.create = create;
  return captureErrors(() => startSignIn({ signIn, setActive, identifier: "a@b.test", password: PASSWORD }));
}

test("startSignIn: form_password_incorrect gives invalid credentials", async () => {
  const { result, logged } = await signInWith(async () => {
    throw { status: 422, clerkTraceId: "trace_1", errors: [{ code: "form_password_incorrect", message: "Password incorrect", meta: { paramName: "password" } }] };
  });
  assert.deepEqual(result, { ok: false, error: SIGN_IN_MESSAGES.signInFailed });
  assert.equal(logged.length, 1);
  const log = logged[0][1];
  assert.equal(log.stage, "create");
  assert.equal(log.status, 422);
  assert.equal(log.clerkTraceId, "trace_1");
  assert.deepEqual(log.clerkErrors, [
    { code: "form_password_incorrect", message: "Password incorrect", longMessage: undefined, paramName: "password" },
  ]);
});

test("startSignIn: form_identifier_not_found gives invalid credentials", async () => {
  const { result } = await signInWith(async () => {
    throw { errors: [{ code: "form_identifier_not_found", message: "Not found" }] };
  });
  assert.deepEqual(result, { ok: false, error: SIGN_IN_MESSAGES.signInFailed });
});

test("startSignIn: form_param_format_invalid is invalid credentials only on the identifier", async () => {
  const onParam = (paramName) => async () => {
    throw { errors: [{ code: "form_param_format_invalid", message: "Bad format", meta: { paramName } }] };
  };
  assert.deepEqual((await signInWith(onParam("email_address"))).result, { ok: false, error: SIGN_IN_MESSAGES.signInFailed });
  assert.deepEqual((await signInWith(onParam("password"))).result, { ok: false, error: "Bad format (code: form_param_format_invalid)" });
});

test("startSignIn: another Clerk code shows its message and the code", async () => {
  const { result } = await signInWith(async () => {
    throw { errors: [{ code: "captcha_invalid", longMessage: "Captcha failed. Clerk could not verify you." }] };
  });
  assert.deepEqual(result, {
    ok: false,
    error: "Captcha failed. the sign-in service could not verify you. (code: captcha_invalid)",
  });
  const bare = await signInWith(async () => {
    throw { errors: [{ code: "captcha_invalid" }] };
  });
  assert.deepEqual(bare.result, { ok: false, error: "Couldn't sign you in. (code: captcha_invalid)" });
});

test("startSignIn: a network error gives the network message, not invalid credentials", async () => {
  for (const caught of [new TypeError("Network request failed"), new TypeError("fetch failed"), new Error("Network request failed")]) {
    const { result } = await signInWith(async () => Promise.reject(caught));
    assert.deepEqual(result, { ok: false, error: SIGN_IN_MESSAGES.network });
  }
});

test("startSignIn: a setActive failure gives the session message and logs stage setActive", async () => {
  const signIn = mockSignIn({}, complete);
  const { result, logged } = await captureErrors(() =>
    startSignIn({
      signIn,
      setActive: async () => {
        throw new Error("session boom");
      },
      identifier: "a@b.test",
      password: PASSWORD,
    }),
  );
  assert.deepEqual(result, { ok: false, error: SIGN_IN_MESSAGES.sessionFailed });
  assert.equal(logged[0][1].stage, "setActive");
});

test("startSignIn: a non-Clerk throw gives an unknown message with a short reason", async () => {
  const { result, logged } = await signInWith(async () => {
    throw new Error("boom ".repeat(40));
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /^Couldn't sign you in\. \(boom boom/);
  assert.ok(result.error.length < 120);
  assert.equal(logged[0][1].errorName, "Error");
});

test("sign-in failure logs never contain the password or the code", async () => {
  const failures = [
    new Error(`boom`),
    { errors: [{ code: "captcha_invalid", message: "No" }] },
    new TypeError("Network request failed"),
  ];
  const all = [];
  for (const caught of failures) all.push(...(await signInWith(async () => Promise.reject(caught))).logged);
  const signIn = mockSignIn();
  signIn.attemptSecondFactor = async () => Promise.reject(new Error("bad"));
  all.push(...(await captureErrors(() => submitCode({ signIn, setActive: recorder().setActive, phase: "second", strategy: "totp", code: "987654" }))).logged);
  assert.ok(all.length >= 4);
  const text = JSON.stringify(all);
  assert.ok(!text.includes(PASSWORD));
  assert.ok(!text.includes("987654"));
});

test("failureMessage: a Clerk message is kept, rephrased and tagged with its code", () => {
  assert.equal(failureMessage({ errors: [{ message: "Too many requests" }] }, { fallback: "f" }), "Too many requests");
  assert.equal(failureMessage(undefined, { fallback: "f" }), "f (undefined)");
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
  assert.deepEqual(outcome, { ok: false, error: "Incorrect code (code: form_code_incorrect)" });
  assert.deepEqual(activated, []);
});

test("submitCode: an unknown failure gives the code message with a reason; a network failure says so", async () => {
  const { setActive } = recorder();
  const signIn = mockSignIn();
  signIn.attemptSecondFactor = async () => Promise.reject(new Error("boom"));
  const { result, logged } = await captureErrors(() => submitCode({ signIn, setActive, phase: "second", strategy: "totp", code: "1" }));
  assert.deepEqual(result, { ok: false, error: `${SIGN_IN_MESSAGES.invalidCode} (boom)` });
  assert.equal(logged[0][1].stage, "attemptSecondFactor");
  signIn.attemptSecondFactor = async () => Promise.reject(new TypeError("Network request failed"));
  const net = await captureErrors(() => submitCode({ signIn, setActive, phase: "second", strategy: "totp", code: "1" }));
  assert.deepEqual(net.result, { ok: false, error: SIGN_IN_MESSAGES.network });
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

const totpResource = resource({
  status: "needs_second_factor",
  supportedSecondFactors: [{ strategy: "totp" }],
});

test("startSignIn: needs_second_factor with totp returns the code step", async () => {
  const { setActive, activated } = recorder();
  const outcome = await startSignIn({ signIn: mockSignIn({}, totpResource), setActive, identifier: "a@b.co", password: "pw" });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.step, { kind: "code", phase: "second", factors: [{ strategy: "totp" }] });
  assert.deepEqual(activated, []);
});

test("startSignIn: works when Array.prototype.toSorted is missing (Hermes release)", async () => {
  const saved = Array.prototype.toSorted;
  delete Array.prototype.toSorted;
  try {
    const multi = resource({
      status: "needs_second_factor",
      supportedSecondFactors: [{ strategy: "backup_code" }, { strategy: "totp" }],
    });
    const outcome = await startSignIn({ signIn: mockSignIn({}, multi), setActive: recorder().setActive, identifier: "a@b.co", password: "pw" });
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.step.factors.map((f) => f.strategy), ["totp", "backup_code"]);
  } finally {
    Array.prototype.toSorted = saved;
  }
});

test("signInFlow.ts does not use toSorted", () => {
  const source = readFileSync(new URL("./signInFlow.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.toSorted\(/);
});

test("startSignIn: a throw while naming the next step is a failure, not an escape", async () => {
  const broken = { ...totpResource, supportedSecondFactors: 5 };
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const outcome = await startSignIn({ signIn: mockSignIn({}, broken), setActive: recorder().setActive, identifier: "a@b.co", password: "pw" });
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /code: nextStep/);
  } finally {
    console.error = originalError;
  }
});

test("startSignIn: a create that never settles times out as timeout_create", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const signIn = { ...mockSignIn(), create: () => new Promise(() => undefined) };
    const pending = startSignIn({ signIn, setActive: recorder().setActive, identifier: "a@b.co", password: "pw" });
    t.mock.timers.tick(SIGN_IN_STAGE_TIMEOUT_MS);
    const outcome = await pending;
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /timed out at create \(code: timeout_create\)/);
  } finally {
    console.error = originalError;
  }
});

test("startSignIn: a setActive that never settles times out as timeout_setActive", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const pending = startSignIn({
      signIn: mockSignIn({}, complete),
      setActive: () => new Promise(() => undefined),
      identifier: "a@b.co",
      password: "pw",
    });
    // `create` resolves on a microtask: let it run, then reach the setActive timer.
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(SIGN_IN_STAGE_TIMEOUT_MS);
    const outcome = await pending;
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /timed out at setActive \(code: timeout_setActive\)/);
  } finally {
    console.error = originalError;
  }
});
