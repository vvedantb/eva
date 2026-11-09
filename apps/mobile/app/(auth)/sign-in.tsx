import { useState } from "react";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { SignInScreen } from "@vvedantb/native-ui/auth";
import { SecondFactorScreen } from "../../components/auth/SecondFactorScreen";
import { SSO_PATH, SSO_SCHEME } from "@/config";
import { submitTotpSecondFactor } from "@/auth/totp";
import { EvaMark } from "@/ui/EvaMark";

/** The web sign-in (Clerk's modal on the landing page): the Eva mark and its copy. */
export default function SignIn() {
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  // The id of the sign-in attempt the user left with Back. Clerk keeps
  // `needs_second_factor` on it, so a new attempt (new id) shows the code step again.
  const [leftAttemptId, setLeftAttemptId] = useState<string | undefined>();

  // TODO: native-ui's `SignInScreen` should own this step. Then move
  // `SecondFactorScreen` into native-ui and delete this branch.
  if (signIn?.status === "needs_second_factor" && signIn.id !== leftAttemptId && setActive) {
    const verify = async (code: string) => {
      setVerifying(true);
      setError("");
      const result = await submitTotpSecondFactor({ signIn, setActive, code });
      setVerifying(false);
      if (result.ok) router.replace("/");
      else setError(result.error);
    };
    return (
      <SecondFactorScreen
        header={<EvaMark size={40} />}
        title="Two-step verification"
        description="Enter the 6-digit code from your authenticator app."
        onSubmit={verify}
        error={error}
        loading={verifying}
        onBack={() => {
          setLeftAttemptId(signIn.id);
          setError("");
        }}
        backLabel="Back to sign in"
      />
    );
  }

  return (
    <SignInScreen
      header={<EvaMark size={40} />}
      title="Sign in to Eva"
      subtitle="Welcome back! Please sign in to continue"
      googleLabel="Continue with Google"
      signUpHref="/sign-up"
      errorDisplay="inline"
      scheme={SSO_SCHEME}
      redirectPath={SSO_PATH}
    />
  );
}
