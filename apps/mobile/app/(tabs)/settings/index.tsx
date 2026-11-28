import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { useAuth, useUser } from "@clerk/expo";
import { Button } from "@vvedantb/native-ui/button";
import { PageHeader, ScreenContainer, SettingsSection, SettingsToggleRow } from "@vvedantb/native-ui/layout";
import { ConfirmDialog, Switch } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";
import { clearAppBadge, getPushToken } from "@/push/push";
import { AppearanceTiles } from "@/settings/AppearanceTiles";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

/**
 * The web settings a phone needs, with the web section names and copy:
 * Appearance (Theme), Email (Notifications), the Push switch in place of the
 * web's desktop pop-ups, and the account.
 */
export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const unregister = useMutation(api.push.unregister);
  const prefs = useQuery(api.auth.getNotificationPrefs, {});
  const setPrefs = useMutation(api.auth.setNotificationPrefs).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.auth.getNotificationPrefs, {});
    if (current) store.setQuery(api.auth.getNotificationPrefs, {}, { ...current, ...args });
  });
  const pushOn = prefs?.push ?? true;
  const togglePush = (push: boolean) => void setPrefs({ push });
  const emailOn = prefs?.email ?? true;
  const toggleEmail = (email: boolean) => void setPrefs({ email });
  const productUpdatesOn = prefs?.productUpdates ?? false;
  const toggleProductUpdates = (productUpdates: boolean) => void setPrefs({ productUpdates });
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const scheme = useScheme();

  const handleSignOut = async () => {
    const token = await getPushToken({ ask: false });
    if (token) await unregister({ token });
    await clearAppBadge();
    await signOut();
  };

  return (
    <TabScreen>
      <PageHeader title="Settings" />
      <ScreenContainer reserveTabBar>
        <View className="gap-8">
          <SettingsSection title="Appearance" description="Choose light, neutral, dark, or system.">
            <AppearanceTiles />
          </SettingsSection>
          <SettingsSection title="Email" bodyVariant="list">
            <SettingsToggleRow
              title="Notifications"
              checked={emailOn}
              disabled={prefs === undefined}
              onCheckedChange={toggleEmail}
              action={
                <Switch
                  size="md"
                  checked={emailOn}
                  disabled={prefs === undefined}
                  onCheckedChange={toggleEmail}
                  offColor={EVA_THEME[scheme].muted}
                  thumbStyle={{ backgroundColor: emailOn ? EVA_THEME[scheme].primaryForeground : tokens.color.white }}
                />
              }
            />
            <SettingsToggleRow
              title="Product updates"
              checked={productUpdatesOn}
              disabled={prefs === undefined}
              onCheckedChange={toggleProductUpdates}
              action={
                <Switch
                  size="md"
                  checked={productUpdatesOn}
                  disabled={prefs === undefined}
                  onCheckedChange={toggleProductUpdates}
                  offColor={EVA_THEME[scheme].muted}
                  thumbStyle={{ backgroundColor: productUpdatesOn ? EVA_THEME[scheme].primaryForeground : tokens.color.white }}
                />
              }
            />
          </SettingsSection>
          <SettingsSection
            title="Phone notifications"
            bodyVariant="list"
          >
            <SettingsToggleRow
              title="Push"
              checked={pushOn}
              disabled={prefs === undefined}
              onCheckedChange={togglePush}
              action={
                <Switch
                  size="md"
                  checked={pushOn}
                  disabled={prefs === undefined}
                  onCheckedChange={togglePush}
                  offColor={EVA_THEME[scheme].muted}
                  thumbStyle={{ backgroundColor: pushOn ? EVA_THEME[scheme].primaryForeground : tokens.color.white }}
                />
              }
            />
          </SettingsSection>
          <SettingsSection title="Account" description={user?.primaryEmailAddress?.emailAddress ?? "Signed in"}>
            <Button variant="outline" size="lg" onPress={() => setConfirmSignOut(true)}>
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
