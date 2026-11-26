import type { EmailPreference } from "@eva/shared/notificationRouting";
import type { Doc } from "../_generated/dataModel";

/**
 * The patch that turns the old email opt-in into the email choice
 * (`dataMigrations:migrateNotificationPrefs`): `true` → "instant", `false` →
 * "off". Only a settings switch ever wrote `false` (signup and onboarding
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
  const email: EmailPreference = legacy ? "instant" : "off";
  return {
    emailNotificationsEnabled: undefined,
    notificationPrefs: { ...user.notificationPrefs, email },
  };
}
