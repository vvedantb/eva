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

  // Drop this phone's push token and badge first, so the next account on it
  // does not get this account's pushes or count.
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
        {/* The web `SettingsStack` rhythm: 32 between sections. */}
        <View className="gap-8">
          <SettingsSection title="Appearance" description="Choose light, neutral, dark, or system.">
            <AppearanceTiles />
          </SettingsSection>
          <SettingsSection title="Email" bodyVariant="list">
            {/* Urgent ones at once, the rest in the daily digest (as the web). */}
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
            {/* The changelog broadcast: opt-in, apart from notification email (as the web). */}
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
            // The web section is `bodyVariant="list"`: the row carries its own padding.
            bodyVariant="list"
          >
            {/* The whole row toggles, as the web `<label htmlFor>`; TalkBack reads one switch. */}
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
                  // Eva's web switch is off on `bg-muted` with a `bg-white` thumb in both schemes.
                  offColor={EVA_THEME[scheme].muted}
                  thumbStyle={{ backgroundColor: pushOn ? EVA_THEME[scheme].primaryForeground : tokens.color.white }}
                />
              }
            />
          </SettingsSection>
          <SettingsSection title="Account" description={user?.primaryEmailAddress?.emailAddress ?? "Signed in"}>
            {/* `lg`, a whole 44 target (the web `default` is 40). */}
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
