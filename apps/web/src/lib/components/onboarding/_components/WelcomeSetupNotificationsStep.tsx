"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button, Checkbox, Spinner, cn } from "@eva/ui";
import {
  IconArrowRight,
  IconBell,
  IconMail,
  IconSparkles,
} from "@tabler/icons-react";

interface WelcomeSetupNotificationsStepProps {
  onOpenNotificationSettings: () => void;
}

const NOTIFICATION_ITEMS = [
  {
    icon: IconSparkles,
    title: "Weekly changelog",
    description:
      "A roundup of what’s new in Eva — features, improvements, and fixes — delivered once a week.",
  },
  {
    icon: IconBell,
    title: "Daily digest",
    description:
      "A daily email summarizing unread in-app notifications so nothing important slips through.",
  },
] as const;

export function WelcomeSetupNotificationsStep({
  onOpenNotificationSettings,
}: WelcomeSetupNotificationsStepProps) {
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

  if (enabled === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Eva can email you about product updates and activity in your codebases.
        Both are optional — you can change this anytime.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {NOTIFICATION_ITEMS.map((item) => (
          <div
            key={item.title}
            className="flex flex-col gap-2 rounded-surface bg-muted/40 p-3"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <item.icon size={14} className="text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {item.title}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      <label
        className={cn(
          "flex items-start gap-3 rounded-surface bg-muted/40 p-3",
          enabled
            ? "cursor-default"
            : "cursor-pointer transition-[background-color] hover:bg-muted/60",
        )}
      >
        <Checkbox
          className="mt-0.5"
          checked={enabled}
          disabled={enabled}
          onCheckedChange={(checked) => {
            if (enabled || checked !== true) return;
            void setEnabled({ enabled: true });
          }}
        />
        <div>
          <div className="flex items-center gap-2">
            <IconMail size={14} className="text-primary" />
            <h3 className="text-sm font-medium">Email me these updates</h3>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {enabled
              ? "You're subscribed. Manage email preferences in settings anytime."
              : "Includes the weekly changelog and daily unread digest. Off by default."}
          </p>
        </div>
      </label>

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
