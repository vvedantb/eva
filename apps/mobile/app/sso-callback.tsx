import { useAuth } from "@clerk/clerk-expo";
import { Button } from "@vvedantb/native-ui/button";
import { Spinner } from "@vvedantb/native-ui/primitives";
import { Redirect, useRouter } from "expo-router";
import { View } from "react-native";

/**
 * `eva://sso-callback`, the Google sign-in redirect. `useSSO` finishes the
 * session; this route only waits for it.
 */
export default function SsoCallbackScreen() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const router = useRouter();
  if (isLoaded && isSignedIn) return <Redirect href="/" />;
  return (
    <View className="flex-1 items-center justify-center gap-6 px-6">
      <Spinner />
      <Button
        variant="ghost"
        fullWidth={false}
        onPress={() => router.replace("/sign-in")}
      >
        Back to sign in
      </Button>
    </View>
  );
}
