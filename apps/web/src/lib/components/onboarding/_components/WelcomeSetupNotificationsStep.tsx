"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import { Button, Spinner } from "@vvedantb/ui";
import { IconArrowRight, IconMail } from "@tabler/icons-react";
import { EmailNotificationsSwitch } from "@/lib/components/notifications/EmailNotificationsSwitch";

interface WelcomeSetupNotificationsStepProps {
  onOpenNotificationSettings: () => void;
}

/** Notification email (`users.notificationPrefs.email`), on until turned off. */
export function WelcomeSetupNotificationsStep({
  onOpenNotificationSettings,
}: WelcomeSetupNotificationsStepProps) {
  const prefs = useQuery(api.auth.getNotificationPrefs);

  if (prefs === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-surface bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <IconMail size={14} className="text-primary" />
          <h3 className="text-sm font-medium">Email</h3>
        </div>
        <EmailNotificationsSwitch email={prefs.email} />
      </div>

      <Button
        type="button"
        variant="ghost"
        className="h-auto gap-1.5 px-0 text-sm text-primary hover:bg-transparent hover:text-primary/80"
        onClick={onOpenNotificationSettings}
      >
        Notification settings
        <IconArrowRight size={14} />
      </Button>
    </div>
  );
}
