"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Switch } from "@vvedantb/ui";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** Saves notification choices, shown at once (optimistic). */
export function useSetNotificationPrefs() {
  return useMutation(api.auth.setNotificationPrefs).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.auth.getNotificationPrefs, {});
      if (current) {
        localStore.setQuery(api.auth.getNotificationPrefs, {}, {
          ...current,
          ...args,
        });
      }
    },
  );
}

/**
 * Notification email on or off (urgent ones at once, the rest in the daily
 * digest): settings → Notifications and onboarding.
 */
export function EmailNotificationsSwitch({ email }: { email: boolean }) {
  const setPrefs = useSetNotificationPrefs();
  return (
    <Switch
      checked={email}
      onCheckedChange={(checked) =>
        void catchMutationError(
          setPrefs({ email: checked }),
          "Couldn't update notifications",
          "email-notifications",
        )
      }
      aria-label="Email notifications"
    />
  );
}
