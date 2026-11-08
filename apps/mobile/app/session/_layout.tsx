import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { EnsureUser } from "@/auth/EnsureUser";

/** Starting a session needs a signed-in user with an Eva row. */
export default function SessionLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return (
    <EnsureUser>
      <Stack screenOptions={{ headerShown: false }} />
    </EnsureUser>
  );
}
