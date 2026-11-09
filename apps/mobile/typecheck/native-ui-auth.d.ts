// Typecheck only (tsconfig.typecheck.json). Metro still bundles the real `@vvedantb/native-ui/auth`.
// native-ui 0.11.1 SignInScreen.tsx fails `strictFunctionTypes` against Clerk's `SignInResource` (TS2322 on
// `prepareFirstFactor`). Delete this file and tsconfig.typecheck.json when native-ui fixes that type.
import type { TokenCache } from "@clerk/clerk-expo";
import type { ConvexReactClient } from "convex/react";
import type { ReactElement, ReactNode } from "react";

export function AuthProviders(props: {
  children: ReactNode;
  publishableKey?: string;
  tokenCache?: TokenCache;
  convex?: ConvexReactClient | null;
  loaded?: boolean;
  clerk?: boolean;
}): ReactElement;

export type SignInScreenProps = {
  scheme: string;
  title?: string;
  subtitle?: string;
  redirectPath?: string;
  googleLabel?: string;
  signUpHref?: string;
  signInHref?: string;
  minPasswordLength?: number;
  errorDisplay?: "toast" | "inline";
  header?: ReactNode;
};

export function SignInScreen(props: SignInScreenProps): ReactElement;
export function SignUpScreen(props: Omit<SignInScreenProps, "signUpHref">): ReactElement;
