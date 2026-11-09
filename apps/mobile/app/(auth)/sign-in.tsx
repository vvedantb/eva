import { SignInScreen } from "@vvedantb/native-ui/auth";
import { SSO_PATH, SSO_SCHEME } from "@/config";
import { EvaMark } from "@/ui/EvaMark";

/** The web sign-in (Clerk's modal on the landing page): the Eva mark and its copy. native-ui owns every incomplete status. */
export default function SignIn() {
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
