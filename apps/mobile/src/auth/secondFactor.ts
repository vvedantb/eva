import { z } from "zod";

export const SECOND_FACTOR_MESSAGES = {
  invalidCode: "Incorrect code. Check the code and try again.",
  sendFailed: "We could not send a code. Try again in a moment.",
  needsAnotherStep: "This account needs another step to sign in. Finish it on the web.",
  noFactor: "This account has no second step that the app supports. Finish sign-in on the web.",
} as const;

/** Seconds a user waits before asking for another SMS or email code. */
export const RESEND_COOLDOWN_SECONDS = 30;

// A supported factor, parsed at the boundary: only the fields each strategy needs.
const factorSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("totp") }),
  z.object({ strategy: z.literal("backup_code") }),
  z.object({ strategy: z.literal("phone_code"), phoneNumberId: z.string() }),
  z.object({ strategy: z.literal("email_code"), emailAddressId: z.string() }),
]);

export type SecondFactor = z.infer<typeof factorSchema>;

/** The part of a Clerk factor that parsing reads. Clerk's `SignInSecondFactor` fits it. */
type FactorInput = { strategy: string; phoneNumberId?: string; emailAddressId?: string };

/**
 * Chooses the factor to show. TOTP wins when present (Eva's production case).
 * Otherwise the first supported factor in Clerk's order wins. Factors that the app
 * cannot handle (such as `email_link`) are skipped. An empty list falls back to
 * TOTP, the only factor Eva enables.
 */
export function pickSecondFactor(factors: readonly FactorInput[] | null | undefined): SecondFactor | undefined {
  const supported: SecondFactor[] = [];
  for (const factor of factors ?? []) {
    const parsed = factorSchema.safeParse(factor);
    if (parsed.success) supported.push(parsed.data);
  }
  if (supported.length === 0) return factors && factors.length > 0 ? undefined : { strategy: "totp" };
  return supported.find((factor) => factor.strategy === "totp") ?? supported[0];
}

/** Whether Clerk must send a code before the user can answer. */
export function needsPrepare(factor: SecondFactor): boolean {
  return factor.strategy === "phone_code" || factor.strategy === "email_code";
}

/** Title, description and input shape for a factor. Plain copy: no Clerk names. */
export function secondFactorCopy(factor: SecondFactor): {
  title: string;
  description: string;
  numeric: boolean;
} {
  switch (factor.strategy) {
    case "totp":
      return {
        title: "Two-step verification",
        description: "Enter the 6-digit code from your authenticator app.",
        numeric: true,
      };
    case "backup_code":
      return {
        title: "Use a backup code",
        description: "Enter one of your saved backup codes.",
        numeric: false,
      };
    case "phone_code":
      return {
        title: "Check your phone",
        description: "Enter the 6-digit code that we sent by text message.",
        numeric: true,
      };
    case "email_code":
      return {
        title: "Check your email",
        description: "Enter the 6-digit code that we sent to your email address.",
        numeric: true,
      };
  }
}

/** The part of Clerk's `SignInResource` that second factors need. Tests pass a mock. */
export type SecondFactorSignIn = {
  supportedSecondFactors: readonly FactorInput[] | null;
  prepareSecondFactor(
    params: { strategy: "phone_code"; phoneNumberId: string } | { strategy: "email_code"; emailAddressId: string },
  ): Promise<{ status: string | null }>;
  attemptSecondFactor(params: {
    strategy: "totp" | "backup_code" | "phone_code" | "email_code";
    code: string;
  }): Promise<{ status: string | null; createdSessionId: string | null }>;
};

type SetActive = (params: { session: string }) => Promise<void>;

export type SecondFactorResult = { ok: true } | { ok: false; error: string };

// A Clerk API error, parsed at the boundary: only the fields we read.
const clerkErrorSchema = z.object({
  errors: z.array(z.object({ longMessage: z.string().optional(), message: z.string().optional() })),
});

/**
 * The first Clerk message, or the fallback. A message that names the provider is
 * never shown. `value` is whatever fell out of a catch — Zod parses it.
 */
export function secondFactorErrorMessage(value: object | null | undefined, fallback: string): string {
  const parsed = clerkErrorSchema.safeParse(value);
  const first = parsed.success ? parsed.data.errors[0] : undefined;
  const message = first?.longMessage ?? first?.message;
  if (message && !/\b(clerk|convex)\b/i.test(message)) return message;
  return fallback;
}

function errorFromCatch(caught: object | null | undefined, fallback: string): string {
  return secondFactorErrorMessage(caught && typeof caught === "object" ? caught : null, fallback);
}

/**
 * Asks Clerk to send a code for SMS and email factors. Call it before the first
 * attempt and on Resend. TOTP and backup codes need nothing, so it returns ok.
 * Never throws.
 */
export async function prepareSecondFactor(args: {
  signIn: SecondFactorSignIn;
  factor: SecondFactor;
}): Promise<SecondFactorResult> {
  const { signIn, factor } = args;
  try {
    if (factor.strategy === "phone_code") {
      await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: factor.phoneNumberId });
    } else if (factor.strategy === "email_code") {
      await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
    }
    return { ok: true };
  } catch (caught) {
    return { ok: false, error: errorFromCatch(caught instanceof Object ? caught : null, SECOND_FACTOR_MESSAGES.sendFailed) };
  }
}

/**
 * Checks a code and starts the session when Clerk reports `complete`.
 * Never throws: a failure is `{ ok: false, error }`.
 */
export async function submitSecondFactor(args: {
  signIn: SecondFactorSignIn;
  setActive: SetActive;
  factor: SecondFactor;
  code: string;
}): Promise<SecondFactorResult> {
  try {
    const attempt = await args.signIn.attemptSecondFactor({ strategy: args.factor.strategy, code: args.code });
    if (attempt.status === "complete" && attempt.createdSessionId) {
      await args.setActive({ session: attempt.createdSessionId });
      return { ok: true };
    }
    return { ok: false, error: SECOND_FACTOR_MESSAGES.needsAnotherStep };
  } catch (caught) {
    return { ok: false, error: errorFromCatch(caught instanceof Object ? caught : null, SECOND_FACTOR_MESSAGES.invalidCode) };
  }
}
