import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { useStackScreenOptions } from "@/ui/stackOptions";

export default function AuthLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const stackOptions = useStackScreenOptions();
  if (isSignedIn) return <Redirect href="/" />;
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
