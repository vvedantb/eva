import { SignUpScreen } from "@vvedantb/native-ui/auth";
import { SSO_PATH, SSO_SCHEME } from "@/config";

export default function SignUp() {
  return (
    <SignUpScreen
      title="Create account"
      subtitle="Sign up to get started"
      googleLabel="Sign up with Google"
      signInHref="/sign-in"
      minPasswordLength={8}
      errorDisplay="inline"
      scheme={SSO_SCHEME}
      redirectPath={SSO_PATH}
    />
  );
}
