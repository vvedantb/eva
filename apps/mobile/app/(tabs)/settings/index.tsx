import { api } from "@eva/backend";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Button } from "@vvedantb/native-ui/button";
import { PageHeader, ScreenContainer, SettingsSection } from "@vvedantb/native-ui/layout";
import { ConfirmDialog } from "@vvedantb/native-ui/primitives";
import { useMutation } from "convex/react";
import { useState } from "react";
import { getPushToken } from "@/push/push";
import { TabScreen } from "@/ui/TabScreen";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const unregister = useMutation(api.push.unregister);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Drop this phone's push token first, so the next account on it does not
  // get this account's pushes.
  const handleSignOut = async () => {
    const token = await getPushToken({ ask: false });
    if (token) await unregister({ token });
    await signOut();
  };

  return (
    <TabScreen>
      <PageHeader title="Settings" />
      <ScreenContainer reserveTabBar>
        <SettingsSection
          title="Notifications"
          description="Eva notifies this phone when an agent needs your input or someone mentions you. Turn them off in Android settings."
        />
        <SettingsSection title="Account" description={user?.primaryEmailAddress?.emailAddress ?? "Signed in"}>
          <Button variant="outline" onPress={() => setConfirmSignOut(true)}>
            Sign out
          </Button>
        </SettingsSection>
      </ScreenContainer>
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="This phone stops getting Eva notifications until you sign in again."
        confirmLabel="Sign out"
        variant="destructive"
        onConfirm={() => void handleSignOut()}
      />
    </TabScreen>
  );
}
