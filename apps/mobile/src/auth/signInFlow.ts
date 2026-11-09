import { z } from "zod";

// Eva owns the result of `signIn.create()`. Native-ui `SignInScreen` shows
// "finish it on the web" for any status but `complete`, so Eva reads the
// resource here and handles every step it can.

export const SIGN_IN_MESSAGES = {
  signInFailed: "Invalid email or password.",
  invalidCode: "Incorrect code. Check the code and try again.",
  sendFailed: "Could not send the code. Try again.",
  passwordFailed: "Could not set the new password. Try again.",
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
  return found.toSorted((a, b) => CODE_STRATEGIES.indexOf(a.strategy) - CODE_STRATEGIES.indexOf(b.strategy));
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
  errors: z.array(z.object({ longMessage: z.string().optional(), message: z.string().optional() })),
});

/** The first Clerk message, or the fallback. A message that names the provider is never shown. */
export function clerkErrorMessage<Caught>(caught: Caught, fallback: string): string {
  const parsed = clerkErrorSchema.safeParse(caught);
  const first = parsed.success ? parsed.data.errors[0] : undefined;
  const message = first?.longMessage ?? first?.message;
  return message && !/\b(clerk|convex)\b/i.test(message) ? message : fallback;
}

/** Names the next step and starts the session when the sign-in is complete. */
async function advance(signIn: SignInLike, setActive: SetActive): Promise<Outcome> {
  const step = nextStep(signIn);
  if (step.kind === "complete") await setActive({ session: step.sessionId });
  if (step.kind === "unsupported") warnUnsupported(step);
  return { ok: true, step, signIn };
}

/** Email and password. Never throws: a failure is `{ ok: false, error }`. */
export async function startSignIn(args: {
  signIn: SignInLike;
  setActive: SetActive;
  identifier: string;
  password: string;
}): Promise<Outcome> {
  try {
    const created = await args.signIn.create({ identifier: args.identifier, password: args.password });
    return await advance(created, args.setActive);
  } catch (caught) {
    return { ok: false, error: clerkErrorMessage(caught, SIGN_IN_MESSAGES.signInFailed) };
  }
}

/** Sends the code. TOTP and backup codes need no send. Never throws. */
export async function sendCode(args: { signIn: SignInLike; phase: Phase; factor: Factor }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { signIn, phase, factor } = args;
  try {
    if (factor.strategy === "email_code") {
      if (phase === "first") {
        if (!factor.emailAddressId) return { ok: false, error: SIGN_IN_MESSAGES.sendFailed };
        await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
      } else {
        await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
      }
    } else if (factor.strategy === "phone_code") {
      if (phase === "first") {
        if (!factor.phoneNumberId) return { ok: false, error: SIGN_IN_MESSAGES.sendFailed };
        await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: factor.phoneNumberId });
      } else {
        await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: factor.phoneNumberId });
      }
    }
    return { ok: true };
  } catch (caught) {
    return { ok: false, error: clerkErrorMessage(caught, SIGN_IN_MESSAGES.sendFailed) };
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
  try {
    let attempt: SignInLike;
    if (phase === "second") {
      attempt = await signIn.attemptSecondFactor({ strategy, code });
    } else if (strategy === "email_code" || strategy === "phone_code") {
      attempt = await signIn.attemptFirstFactor({ strategy, code });
    } else {
      return { ok: false, error: SIGN_IN_MESSAGES.invalidCode };
    }
    return await advance(attempt, args.setActive);
  } catch (caught) {
    return { ok: false, error: clerkErrorMessage(caught, SIGN_IN_MESSAGES.invalidCode) };
  }
}

/** Sets a new password when Clerk asks for one. Never throws. */
export async function submitNewPassword(args: { signIn: SignInLike; setActive: SetActive; password: string }): Promise<Outcome> {
  try {
    const reset = await args.signIn.resetPassword({ password: args.password });
    return await advance(reset, args.setActive);
  } catch (caught) {
    return { ok: false, error: clerkErrorMessage(caught, SIGN_IN_MESSAGES.passwordFailed) };
  }
}
