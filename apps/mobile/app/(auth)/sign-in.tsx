import { SignInScreen } from "@vvedantb/native-ui/auth";
import { SSO_PATH, SSO_SCHEME } from "@/config";

export default function SignIn() {
  return (
    <SignInScreen
      title="Welcome back"
      subtitle="Sign in to your account"
      googleLabel="Sign in with Google"
      signUpHref="/sign-up"
      errorDisplay="inline"
      scheme={SSO_SCHEME}
      redirectPath={SSO_PATH}
    />
  );
}
