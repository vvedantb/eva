import { z } from "zod";

// Eva owns the result of `signIn.create()`. Native-ui `SignInScreen` shows
// "finish it on the web" for any status but `complete`, so Eva reads the
// resource here and handles every step it can.

export const SIGN_IN_MESSAGES = {
  signInFailed: "Invalid email or password.",
  invalidCode: "Incorrect code. Check the code and try again.",
  sendFailed: "Could not send the code. Try again.",
  passwordFailed: "Could not set the new password. Try again.",
  signInUnknown: "Couldn't sign you in.",
  network: "Could not reach the server. Check your connection and try again.",
  sessionFailed: "Signed in, but couldn't start your session. Try again.",
  needsAnotherStep: "This account needs another step to sign in. Finish it on the web.",
} as const;

/** Seconds before a code can be sent again. */
export const RESEND_COOLDOWN_SECONDS = 30;

/** Code strategies Eva can finish. Order is the order of the switcher. */
export const CODE_STRATEGIES = ["totp", "email_code", "phone_code", "backup_code"] as const;
export type CodeStrategy = (typeof CODE_STRATEGIES)[number];

const codeStrategySchema = z.enum(CODE_STRATEGIES);

export type Factor = { strategy: CodeStrategy; emailAddressId?: string; phoneNumberId?: string; safeIdentifier?: string };
export type Phase = "first" | "second";

export type SignInStep =
  | { kind: "complete"; sessionId: string }
  | { kind: "code"; phase: Phase; factors: Factor[] }
  | { kind: "new_password" }
  | { kind: "unsupported"; status: string; strategies: string[] };

type RawFactor = { strategy: string; emailAddressId?: string; phoneNumberId?: string; safeIdentifier?: string };

/**
 * The part of Clerk's `SignInResource` that Eva uses. `status` is a plain
 * string: Clerk's type omits `needs_client_trust`, which the API can return.
 * Tests pass a mock.
 */
export type SignInLike = {
  status: string | null;
  createdSessionId: string | null;
  supportedFirstFactors: readonly RawFactor[] | null;
  supportedSecondFactors: readonly RawFactor[] | null;
  create(params: { identifier: string; password: string }): Promise<SignInLike>;
  prepareFirstFactor(params: { strategy: "email_code"; emailAddressId: string } | { strategy: "phone_code"; phoneNumberId: string }): Promise<SignInLike>;
  attemptFirstFactor(params: { strategy: "email_code" | "phone_code"; code: string }): Promise<SignInLike>;
  prepareSecondFactor(params: { strategy: "email_code"; emailAddressId?: string } | { strategy: "phone_code"; phoneNumberId?: string }): Promise<SignInLike>;
  attemptSecondFactor(params: { strategy: CodeStrategy; code: string }): Promise<SignInLike>;
  resetPassword(params: { password: string }): Promise<SignInLike>;
};

export type SetActive = (params: { session: string }) => Promise<void>;

export type Outcome = { ok: true; step: SignInStep; signIn: SignInLike } | { ok: false; error: string };

function codeFactors(raw: readonly RawFactor[] | null): Factor[] {
  const found: Factor[] = [];
  for (const factor of raw ?? []) {
    const strategy = codeStrategySchema.safeParse(factor.strategy);
    // One factor per strategy: the first the API lists is the default.
    if (strategy.success && !found.some((f) => f.strategy === strategy.data)) {
      found.push({ ...factor, strategy: strategy.data });
    }
  }
  // Not `toSorted`: Hermes release builds can lack it (see `hermesApis.test.mjs`).
  return found.sort((a, b) => CODE_STRATEGIES.indexOf(a.strategy) - CODE_STRATEGIES.indexOf(b.strategy));
}

/** Reads the resource and names the next step. Pure. */
export function nextStep(signIn: SignInLike): SignInStep {
  const status = signIn.status ?? "none";
  const unsupported: SignInStep = {
    kind: "unsupported",
    status,
    strategies: [...(signIn.supportedFirstFactors ?? []), ...(signIn.supportedSecondFactors ?? [])].map((f) => f.strategy),
  };
  switch (status) {
    case "complete":
      return signIn.createdSessionId ? { kind: "complete", sessionId: signIn.createdSessionId } : unsupported;
    // Device Trust: Clerk asks for an emailed or texted code on the second-factor calls.
    case "needs_client_trust":
    case "needs_second_factor": {
      const factors = codeFactors(signIn.supportedSecondFactors).filter(
        (f) => status === "needs_second_factor" || f.strategy === "email_code" || f.strategy === "phone_code",
      );
      return factors.length ? { kind: "code", phase: "second", factors } : unsupported;
    }
    case "needs_first_factor": {
      const factors = codeFactors(signIn.supportedFirstFactors).filter(
        (f) => f.strategy === "email_code" || f.strategy === "phone_code",
      );
      return factors.length ? { kind: "code", phase: "first", factors } : unsupported;
    }
    case "needs_new_password":
      return { kind: "new_password" };
    default:
      return unsupported;
  }
}

/** Logs an unsupported state: the status and strategy names only. */
export function warnUnsupported(step: Extract<SignInStep, { kind: "unsupported" }>) {
  console.warn(`[sign-in] unsupported status "${step.status}", strategies: ${step.strategies.join(", ") || "none"}`);
}

// A Clerk API error, parsed at the boundary: only the fields we read.
const clerkErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  longMessage: z.string().optional(),
  meta: z.object({ paramName: z.string().optional() }).optional(),
});
const clerkFailureSchema = z.object({ errors: z.array(clerkErrorSchema).min(1) });
const traceSchema = z.object({ status: z.number().optional(), clerkTraceId: z.string().optional() });

/** Which call failed. Logged with every failure. */
export type FailureStage =
  | "create"
  | "prepareFirstFactor"
  | "prepareSecondFactor"
  | "attemptFirstFactor"
  | "attemptSecondFactor"
  | "setActive"
  | "resetPassword"
  | "nextStep"
  | "other";

/** Milliseconds each Clerk call may take before Eva stops waiting. */
export const SIGN_IN_STAGE_TIMEOUT_MS = 20_000;

/** A call that did not settle within `SIGN_IN_STAGE_TIMEOUT_MS`. */
export class StageTimeoutError extends Error {
  readonly stage: FailureStage;
  constructor(stage: FailureStage) {
    super(`Sign-in timed out at ${stage} (code: timeout_${stage})`);
    this.name = "StageTimeoutError";
    this.stage = stage;
  }
}

/** Runs `work`; rejects with `StageTimeoutError` when it takes too long. Clears its timer. */
function withTimeout<Result>(stage: FailureStage, work: () => Promise<Result>): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StageTimeoutError(stage)), SIGN_IN_STAGE_TIMEOUT_MS);
    Promise.resolve()
      .then(work)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

/** Clerk codes that mean the credentials are wrong. */
const CREDENTIAL_CODES = new Set(["form_password_incorrect", "form_identifier_not_found"]);
const IDENTIFIER_PARAMS = new Set(["identifier", "email_address", "username", "phone_number"]);

const NETWORK_MESSAGE = /network request failed|failed to fetch|fetch failed/i;

function errorName<Caught>(caught: Caught): string {
  if (caught instanceof Error) return caught.name;
  return typeof caught === "object" && caught !== null ? "object" : typeof caught;
}

function errorText<Caught>(caught: Caught): string {
  return caught instanceof Error ? caught.message : "";
}

/** Names the provider less. Never discards the message. */
function rephrase(message: string): string {
  return message.replace(/\b(clerk|convex)\b/gi, "the sign-in service");
}

/** Logs the failure: stage, error name, Clerk codes. Never the password or a code. Never throws. */
function logFailure<Caught>(stage: FailureStage, caught: Caught) {
  try {
    const clerk = clerkFailureSchema.safeParse(caught);
    const trace = traceSchema.safeParse(caught);
    console.error("[sign-in] failure", {
      stage,
      errorName: errorName(caught),
      errorMessage: clerk.success ? undefined : errorText(caught).slice(0, 200) || undefined,
      status: trace.success ? trace.data.status : undefined,
      clerkTraceId: trace.success ? trace.data.clerkTraceId : undefined,
      clerkErrors: clerk.success
        ? clerk.data.errors.map((e) => ({
            code: e.code,
            message: e.message,
            longMessage: e.longMessage,
            paramName: e.meta?.paramName,
          }))
        : undefined,
    });
  } catch {
    // A logger must never break sign-in.
  }
}

/**
 * The user-facing message for a failure. `credentials` is true for the
 * email and password call: only there do the wrong-credentials codes give
 * "Invalid email or password.".
 */
export function failureMessage<Caught>(caught: Caught, opts: { fallback: string; credentials?: boolean }): string {
  if (caught instanceof StageTimeoutError) return caught.message;
  const clerk = clerkFailureSchema.safeParse(caught);
  if (clerk.success) {
    const first = clerk.data.errors[0];
    const { code } = first;
    const onIdentifier = first.meta?.paramName !== undefined && IDENTIFIER_PARAMS.has(first.meta.paramName);
    if (
      opts.credentials &&
      code !== undefined &&
      (CREDENTIAL_CODES.has(code) || (code === "form_param_format_invalid" && onIdentifier))
    ) {
      return SIGN_IN_MESSAGES.signInFailed;
    }
    const text = rephrase(first.longMessage ?? first.message ?? "") || opts.fallback;
    return code ? `${text} (code: ${code})` : text;
  }
  const text = errorText(caught);
  if (caught instanceof TypeError || NETWORK_MESSAGE.test(text)) return SIGN_IN_MESSAGES.network;
  return `${opts.fallback} (${text.slice(0, 80) || errorName(caught)})`;
}

/** Logs a failure and returns it as an outcome. */
function fail<Caught>(stage: FailureStage, caught: Caught, opts: { fallback: string; credentials?: boolean }): { ok: false; error: string } {
  logFailure(stage, caught);
  return { ok: false, error: failureMessage(caught, opts) };
}

/** Names the next step and starts the session when the sign-in is complete. Never throws. */
async function advance(signIn: SignInLike, setActive: SetActive): Promise<Outcome> {
  try {
    const step = nextStep(signIn);
    if (step.kind === "complete") {
      try {
        await withTimeout("setActive", () => setActive({ session: step.sessionId }));
      } catch (caught) {
        if (caught instanceof StageTimeoutError) return fail("setActive", caught, { fallback: SIGN_IN_MESSAGES.sessionFailed });
        logFailure("setActive", caught);
        return { ok: false, error: SIGN_IN_MESSAGES.sessionFailed };
      }
    }
    if (step.kind === "unsupported") warnUnsupported(step);
    return { ok: true, step, signIn };
  } catch (caught) {
    logFailure("nextStep", caught);
    const reason = `${errorName(caught)}: ${errorText(caught)}`.slice(0, 80);
    return { ok: false, error: `${SIGN_IN_MESSAGES.signInUnknown} (code: nextStep, ${reason})` };
  }
}

/** Email and password. Never throws: a failure is `{ ok: false, error }`. */
export async function startSignIn(args: {
  signIn: SignInLike;
  setActive: SetActive;
  identifier: string;
  password: string;
}): Promise<Outcome> {
  let created: SignInLike;
  try {
    created = await withTimeout("create", () => args.signIn.create({ identifier: args.identifier, password: args.password }));
  } catch (caught) {
    return fail("create", caught, { fallback: SIGN_IN_MESSAGES.signInUnknown, credentials: true });
  }
  return advance(created, args.setActive);
}

function missingFactorId(stage: FailureStage): { ok: false; error: string } {
  console.error("[sign-in] failure", { stage, errorName: "MissingFactorId" });
  return { ok: false, error: SIGN_IN_MESSAGES.sendFailed };
}

/** Sends the code. TOTP and backup codes need no send. Never throws. */
export async function sendCode(args: { signIn: SignInLike; phase: Phase; factor: Factor }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { signIn, phase, factor } = args;
  const stage = phase === "first" ? "prepareFirstFactor" : "prepareSecondFactor";
  try {
    if (factor.strategy === "email_code") {
      if (phase === "first") {
        if (!factor.emailAddressId) return missingFactorId(stage);
        const { emailAddressId } = factor;
        await withTimeout(stage, () => signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId }));
      } else {
        const { emailAddressId } = factor;
        await withTimeout(stage, () => signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId }));
      }
    } else if (factor.strategy === "phone_code") {
      if (phase === "first") {
        if (!factor.phoneNumberId) return missingFactorId(stage);
        const { phoneNumberId } = factor;
        await withTimeout(stage, () => signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId }));
      } else {
        const { phoneNumberId } = factor;
        await withTimeout(stage, () => signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId }));
      }
    }
    return { ok: true };
  } catch (caught) {
    return fail(stage, caught, { fallback: SIGN_IN_MESSAGES.sendFailed });
  }
}

/** Checks a code. The result may be another step. Never throws. */
export async function submitCode(args: {
  signIn: SignInLike;
  setActive: SetActive;
  phase: Phase;
  strategy: CodeStrategy;
  code: string;
}): Promise<Outcome> {
  const { signIn, phase, strategy, code } = args;
  const stage = phase === "second" ? "attemptSecondFactor" : "attemptFirstFactor";
  const opts = { fallback: SIGN_IN_MESSAGES.invalidCode };
  let attempt: SignInLike;
  try {
    if (phase === "second") {
      attempt = await withTimeout(stage, () => signIn.attemptSecondFactor({ strategy, code }));
    } else if (strategy === "email_code" || strategy === "phone_code") {
      attempt = await withTimeout(stage, () => signIn.attemptFirstFactor({ strategy, code }));
    } else {
      console.error("[sign-in] failure", { stage, errorName: "UnsupportedStrategy" });
      return { ok: false, error: SIGN_IN_MESSAGES.invalidCode };
    }
  } catch (caught) {
    return fail(stage, caught, opts);
  }
  return advance(attempt, args.setActive);
}

/** Sets a new password when Clerk asks for one. Never throws. */
export async function submitNewPassword(args: { signIn: SignInLike; setActive: SetActive; password: string }): Promise<Outcome> {
  let reset: SignInLike;
  try {
    reset = await withTimeout("resetPassword", () => args.signIn.resetPassword({ password: args.password }));
  } catch (caught) {
    return fail("resetPassword", caught, { fallback: SIGN_IN_MESSAGES.passwordFailed });
  }
  return advance(reset, args.setActive);
}
