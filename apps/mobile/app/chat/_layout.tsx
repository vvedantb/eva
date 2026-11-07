import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";

/** Chats need a signed-in user: every query here is an auth query. */
export default function ChatLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
