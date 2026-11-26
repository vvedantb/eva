"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Tabs, TabsList, TabsTrigger } from "@vvedantb/ui";
import {
  EMAIL_PREFERENCE_OPTIONS,
  isEmailPreference,
  type EmailPreference,
} from "@eva/shared/notificationRouting";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** Instant / Daily digest / Off: settings → Notifications and onboarding. */
export function EmailPreferenceTabs({ email }: { email: EmailPreference }) {
  const setPrefs = useMutation(
    api.auth.setNotificationPrefs,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.auth.getNotificationPrefs, {});
    if (current) {
      localStore.setQuery(api.auth.getNotificationPrefs, {}, {
        ...current,
        ...args,
      });
    }
  });

  return (
    <Tabs
      value={email}
      onValueChange={(value) => {
        if (!isEmailPreference(value)) return;
        void catchMutationError(
          setPrefs({ email: value }),
          "Couldn't update notifications",
          "email-notifications",
        );
      }}
    >
      <TabsList size="sm" aria-label="Email notifications">
        {EMAIL_PREFERENCE_OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
