import { z } from "zod";

export const TOTP_MESSAGES = {
  invalidCode: "Incorrect code. Check your authenticator app and try again.",
  needsAnotherStep: "This account needs another step to sign in. Finish it on the web.",
} as const;

/** The part of Clerk's `SignInResource` that TOTP needs. Tests pass a mock. */
type TotpSignIn = {
  attemptSecondFactor(params: {
    strategy: "totp";
    code: string;
  }): Promise<{ status: string | null; createdSessionId: string | null }>;
};

type SetActive = (params: { session: string }) => Promise<void>;

export type TotpResult = { ok: true } | { ok: false; error: string };

// A Clerk API error, parsed at the boundary: only the fields we read.
const clerkErrorSchema = z.object({
  errors: z.array(z.object({ longMessage: z.string().optional(), message: z.string().optional() })),
});

type ClerkError = z.infer<typeof clerkErrorSchema>;

/** The first Clerk message, or the fallback. A message that names the provider is never shown. */
export function totpErrorMessage(error: ClerkError | undefined): string {
  const first = error?.errors[0];
  const message = first?.longMessage ?? first?.message;
  if (message && !/\b(clerk|convex)\b/i.test(message)) return message;
  return TOTP_MESSAGES.invalidCode;
}

/**
 * Checks a TOTP code and starts the session. TOTP needs no
 * `prepareSecondFactor`. Never throws: a failure is `{ ok: false, error }`.
 */
export async function submitTotpSecondFactor(args: {
  signIn: TotpSignIn;
  setActive: SetActive;
  code: string;
}): Promise<TotpResult> {
  try {
    const attempt = await args.signIn.attemptSecondFactor({ strategy: "totp", code: args.code });
    if (attempt.status === "complete" && attempt.createdSessionId) {
      await args.setActive({ session: attempt.createdSessionId });
      return { ok: true };
    }
    return { ok: false, error: TOTP_MESSAGES.needsAnotherStep };
  } catch (caught) {
    const parsed = clerkErrorSchema.safeParse(caught);
    return { ok: false, error: totpErrorMessage(parsed.success ? parsed.data : undefined) };
  }
}
