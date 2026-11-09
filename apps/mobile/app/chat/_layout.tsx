import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { EnsureUser } from "@/auth/EnsureUser";

/** Chats need a signed-in user: every query here is an auth query. */
export default function ChatLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return (
    <EnsureUser>
      <Stack screenOptions={{ headerShown: false }} />
    </EnsureUser>
  );
}
