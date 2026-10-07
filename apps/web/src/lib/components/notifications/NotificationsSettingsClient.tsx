"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Spinner, Switch } from "@eva/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import {
  catchMutationError,
  mutationError,
} from "@/lib/utils/mutationToast";
import {
  disableDesktopNotifications,
  enableDesktopNotifications,
  useDesktopNotifications,
} from "@/lib/components/notifications/desktopNotifications";

export function NotificationsSettingsClient() {
  const enabled = useQuery(api.auth.getEmailNotificationsEnabled);
  const setEnabled = useMutation(
    api.auth.setEmailNotificationsEnabled,
  ).withOptimisticUpdate((localStore, args) => {
    localStore.setQuery(
      api.auth.getEmailNotificationsEnabled,
      {},
      args.enabled,
    );
  });
  const desktop = useDesktopNotifications();

  const toggleDesktop = async (checked: boolean) => {
    if (!checked) {
      disableDesktopNotifications();
      return;
    }
    const result = await enableDesktopNotifications();
    if (result === "denied") {
      mutationError(
        "Notifications are blocked for Eva. Allow them in your browser's site settings, then try again.",
        "desktop-notifications",
      );
    }
  };

  if (enabled === undefined) {
    return (
      <SettingsPage title="Notifications">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Notifications">
      <SettingsSection
        title="Email notifications"
        description="How Eva reaches you outside the app."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Send summary and changelog"
          description="Receive a daily summary of unread notifications and the weekly changelog by email."
          action={
            <Switch
              checked={enabled}
              onCheckedChange={(checked) =>
                catchMutationError(
                  setEnabled({ enabled: checked }),
                  "Couldn't update notifications",
                  "email-notifications",
                )
              }
              aria-label="Email notifications"
            />
          }
        />
      </SettingsSection>
      <SettingsSection
        title="Desktop notifications"
        description="System pop-ups while Eva is open in the background."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Show pop-ups"
          description={
            desktop.supported
              ? "Show a system pop-up for new notifications when Eva is open but you are in another app. Only on this device."
              : "This browser does not support desktop notifications."
          }
          action={
            <Switch
              checked={desktop.enabled}
              disabled={!desktop.supported}
              onCheckedChange={(checked) => void toggleDesktop(checked)}
              aria-label="Desktop notifications"
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}
