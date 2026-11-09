// The Clerk-aware second step of sign-in. It picks the factor, sends the SMS or
// email code when needed, and wires Verify, Resend and Back into `SecondFactorScreen`,
// which stays free of Clerk imports.
// useEffect: one mount send for SMS/email — no user event starts that prepare.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  needsPrepare,
  pickSecondFactor,
  prepareSecondFactor,
  RESEND_COOLDOWN_SECONDS,
  SECOND_FACTOR_MESSAGES,
  secondFactorCopy,
  submitSecondFactor,
  type SecondFactorSignIn,
} from "@/auth/secondFactor";
import { useResendCooldown } from "@/auth/useResendCooldown";
import { SecondFactorScreen } from "./SecondFactorScreen";

type Props = {
  signIn: SecondFactorSignIn & { id?: string };
  setActive: (params: { session: string }) => Promise<void>;
  /** Called after the session starts. */
  onDone: () => void;
  onBack: () => void;
  header?: ReactNode;
};

export function SignInSecondFactor({ signIn, setActive, onDone, onBack, header }: Props) {
  const factor = pickSecondFactor(signIn.supportedSecondFactors);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const cooldown = useResendCooldown(RESEND_COOLDOWN_SECONDS);
  // The sign-in attempt that already got its first code. Stops a double send when
  // dev StrictMode runs the effect twice.
  const preparedFor = useRef<string | undefined>(undefined);

  const send = async () => {
    if (!factor) return;
    setError("");
    const result = await prepareSecondFactor({ signIn, factor });
    if (result.ok) cooldown.start();
    else setError(result.error);
  };

  /* eslint-disable no-effect/no-event-handler --
     Opening the second-factor step is the trigger: SMS/email must send once with
     no user tap. Resend stays a real button handler below. */
  useEffect(() => {
    if (!factor || !needsPrepare(factor) || preparedFor.current === signIn.id) return;
    preparedFor.current = signIn.id;
    void send();
    // eslint-disable-next-line react/exhaustive-deps -- first send is keyed on attempt id only
  }, [signIn.id]);
  /* eslint-enable no-effect/no-event-handler */

  if (!factor) {
    return (
      <SecondFactorScreen
        header={header}
        title="Two-step verification"
        description={SECOND_FACTOR_MESSAGES.noFactor}
        onSubmit={() => {}}
        onBack={onBack}
        backLabel="Back to sign in"
      />
    );
  }

  const verify = async (code: string) => {
    setVerifying(true);
    setError("");
    const result = await submitSecondFactor({ signIn, setActive, factor, code });
    setVerifying(false);
    if (result.ok) onDone();
    else setError(result.error);
  };

  const copy = secondFactorCopy(factor);
  return (
    <SecondFactorScreen
      key={factor.strategy}
      header={header}
      title={copy.title}
      description={copy.description}
      numeric={copy.numeric}
      onSubmit={verify}
      error={error}
      loading={verifying}
      onResend={needsPrepare(factor) ? () => void send() : undefined}
      resendSeconds={cooldown.remaining}
      onBack={onBack}
      backLabel="Back to sign in"
    />
  );
}
