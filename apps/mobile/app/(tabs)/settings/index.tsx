import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { Button } from "@vvedantb/native-ui/button";
import { PageHeader, ScreenContainer, SettingsSection, SettingsToggleRow } from "@vvedantb/native-ui/layout";
import { ConfirmDialog, Switch } from "@vvedantb/native-ui/primitives";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";
import { getPushToken } from "@/push/push";
import { AppearanceTiles } from "@/settings/AppearanceTiles";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

/**
 * The web settings a phone needs, with the web section names and copy:
 * Appearance (Theme), Email notifications (Notifications), phone pushes in
 * place of the web's desktop pop-ups, and the account.
 */
export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const unregister = useMutation(api.push.unregister);
  const emailEnabled = useQuery(api.auth.getEmailNotificationsEnabled, {});
  const setEmailEnabled = useMutation(api.auth.setEmailNotificationsEnabled).withOptimisticUpdate((store, args) => {
    store.setQuery(api.auth.getEmailNotificationsEnabled, {}, args.enabled);
  });
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const scheme = useScheme();

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
        {/* The web `SettingsStack` rhythm: 32 between sections. */}
        <View className="gap-8">
          <SettingsSection title="Appearance" description="Choose light, dark, or system.">
            <AppearanceTiles />
          </SettingsSection>
          <SettingsSection
            title="Email notifications"
            description="How Eva reaches you outside the app."
            // The web section is `bodyVariant="list"`: the row carries its own padding.
            bodyVariant="list"
          >
            <SettingsToggleRow
              title="Send summary and changelog"
              description="Receive a daily summary of unread notifications and the weekly changelog by email."
              action={
                <Switch
                  checked={emailEnabled ?? false}
                  disabled={emailEnabled === undefined}
                  onCheckedChange={(enabled: boolean) => void setEmailEnabled({ enabled })}
                  accessibilityLabel="Email notifications"
                  // Eva's web switch is off on `bg-muted`.
                  offColor={EVA_THEME[scheme].muted}
                />
              }
            />
          </SettingsSection>
          <SettingsSection
            title="Phone notifications"
            description="Eva notifies this phone when an agent needs your input or someone mentions you. Turn them off in Android settings."
          />
          <SettingsSection title="Account" description={user?.primaryEmailAddress?.emailAddress ?? "Signed in"}>
            <Button variant="outline" onPress={() => setConfirmSignOut(true)}>
              Sign out
            </Button>
          </SettingsSection>
        </View>
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
