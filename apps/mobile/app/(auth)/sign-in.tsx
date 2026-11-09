import { useState } from "react";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { SignInScreen } from "@vvedantb/native-ui/auth";
import { SignInSecondFactor } from "../../components/auth/SignInSecondFactor";
import { SSO_PATH, SSO_SCHEME } from "@/config";
import { EvaMark } from "@/ui/EvaMark";

/** The web sign-in (Clerk's modal on the landing page): the Eva mark and its copy. */
export default function SignIn() {
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  // The id of the sign-in attempt the user left with Back. Clerk keeps
  // `needs_second_factor` on it, so a new attempt (new id) shows the code step again.
  const [leftAttemptId, setLeftAttemptId] = useState<string | undefined>();

  // clerk-expo 2.20.2 has no `needs_client_trust` in `SignInStatus` (only
  // needs_identifier | needs_first_factor | needs_second_factor | needs_new_password | complete),
  // so there is no handler for it. Add one only after a clerk-expo upgrade adds the status.
  // TODO: native-ui's `SignInScreen` should own this step. Then move
  // `SecondFactorScreen` into native-ui and delete this branch.
  if (signIn?.status === "needs_second_factor" && signIn.id !== leftAttemptId && setActive) {
    return (
      <SignInSecondFactor
        header={<EvaMark size={40} />}
        signIn={signIn}
        setActive={setActive}
        onDone={() => router.replace("/")}
        onBack={() => setLeftAttemptId(signIn.id)}
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
