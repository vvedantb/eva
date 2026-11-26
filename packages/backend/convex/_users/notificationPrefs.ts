import type { Doc } from "../_generated/dataModel";

/**
 * The patch that turns the old email opt-in into the email choice
 * (`dataMigrations:migrateNotificationPrefs`): `true` → email on and Product
 * updates on (the old switch covered the changelog too), `false` → email off. Only a settings switch ever wrote `false` (signup and onboarding
 * never did), so it is a person's choice and stays off. Unset stays unset
 * (the default, "instant"). Clears the legacy field either way; a choice made
 * since the deploy wins. Undefined when there is nothing to do.
 */
export function notificationPrefsFromLegacy(
  user: Doc<"users">,
): Partial<Doc<"users">> | undefined {
  const legacy = user.emailNotificationsEnabled;
  if (legacy === undefined) return undefined;
  if (user.notificationPrefs?.email !== undefined) {
    return { emailNotificationsEnabled: undefined };
  }
  return {
    emailNotificationsEnabled: undefined,
    notificationPrefs: {
      ...user.notificationPrefs,
      email: legacy,
      ...(legacy ? { productUpdates: true } : {}),
    },
  };
}
