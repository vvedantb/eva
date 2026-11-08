import { SignUpScreen } from "@vvedantb/native-ui/auth";
import { SSO_PATH, SSO_SCHEME } from "@/config";
import { EvaMark } from "@/ui/EvaMark";

/** The web sign-up (Clerk's modal on the landing page): the Eva mark and its copy. */
export default function SignUp() {
  return (
    <SignUpScreen
      header={<EvaMark size={40} />}
      title="Create your account"
      subtitle="Welcome! Please fill in the details to get started."
      googleLabel="Continue with Google"
      signInHref="/sign-in"
      minPasswordLength={8}
      errorDisplay="inline"
      scheme={SSO_SCHEME}
      redirectPath={SSO_PATH}
    />
  );
}
