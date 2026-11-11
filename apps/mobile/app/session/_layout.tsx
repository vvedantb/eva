import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { EnsureUser } from "@/auth/EnsureUser";
import { useStackScreenOptions } from "@/ui/stackOptions";

/** Starting a session needs a signed-in user with an Eva row. */
export default function SessionLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const stackOptions = useStackScreenOptions();
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return (
    <EnsureUser>
      <Stack screenOptions={stackOptions} />
    </EnsureUser>
  );
}
