"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import {
  Spinner,
  Switch,
  SettingsToggleRow,
  SettingsSection,
} from "@vvedantb/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { catchMutationError, mutationError } from "@/lib/utils/mutationToast";
import {
  disableDesktopNotifications,
  enableDesktopNotifications,
  useDesktopNotifications,
} from "@/lib/components/notifications/desktopNotifications";
import {
  EmailNotificationsSwitch,
  useSetNotificationPrefs,
} from "@/lib/components/notifications/EmailNotificationsSwitch";

/**
 * Email is stored per person (`users.notificationPrefs`); desktop pop-ups are
 * per device. Phone push is set in the phone app.
 */
export function NotificationsSettingsClient() {
  const prefs = useQuery(api.auth.getNotificationPrefs);
  const setPrefs = useSetNotificationPrefs();
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

  if (prefs === undefined) {
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
      <SettingsSection title="Email" bodyVariant="list">
        <SettingsToggleRow
          title="Notifications"
          action={<EmailNotificationsSwitch email={prefs.email} />}
        />
        {/* The changelog broadcast: opt-in, apart from notification email. */}
        <SettingsToggleRow
          title="Product updates"
          action={
            <Switch
              checked={prefs.productUpdates}
              onCheckedChange={(productUpdates) =>
                void catchMutationError(
                  setPrefs({ productUpdates }),
                  "Couldn't update notifications",
                  "product-updates",
                )
              }
              aria-label="Product updates"
            />
          }
        />
      </SettingsSection>
      <SettingsSection title="Desktop notifications" bodyVariant="list">
        <SettingsToggleRow
          title="Show pop-ups"
          description={
            desktop.supported
              ? undefined
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
