"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Input, Spinner, Switch } from "@eva/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { catchMutationError } from "@/lib/utils/mutationToast";

/**
 * App-wide setting for the daily sandbox auto-stop sweep. The entered time is
 * interpreted in the browser's timezone (captured on save), so it reads as the
 * user's local time and a backend cron stops every running sandbox at that time
 * each day. Binds directly to the Convex query with an optimistic update — no
 * local form state.
 */
export function SandboxAutoStopSettingsClient() {
  const settings = useQuery(api.sandboxAutoStop.getSandboxAutoStopSettings);
  const save = useMutation(
    api.sandboxAutoStop.setSandboxAutoStopSettings,
  ).withOptimisticUpdate((localStore, args) => {
    localStore.setQuery(
      api.sandboxAutoStop.getSandboxAutoStopSettings,
      {},
      { enabled: args.enabled, time: args.time, timeZone: args.timeZone },
    );
  });

  if (settings === undefined) {
    return (
      <SettingsPage title="Sandboxes">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  const browserTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  const saveSettings = (args: {
    enabled: boolean;
    time: string;
    timeZone: string;
  }) =>
    catchMutationError(
      save(args),
      "Couldn't save sandbox settings",
      "sandbox-autostop",
    );

  return (
    <SettingsPage title="Sandboxes">
      <SettingsSection
        title="Daily auto-stop"
        description="Stop running sandboxes every day."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Enabled"
          description="Applies to all sandboxes across the app."
          action={
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                saveSettings({
                  enabled: checked,
                  time: settings.time,
                  timeZone: browserTimeZone,
                })
              }
              aria-label="Daily auto-stop"
            />
          }
        />
        {settings.enabled ? (
          <div className="px-4 py-3">
            <SettingsField
              label="Stop time"
              description={`Uses ${settings.timeZone}. The sweep runs within 15 minutes of this time.`}
            >
              <Input
                type="time"
                className="w-40"
                value={settings.time}
                onChange={(event) =>
                  saveSettings({
                    enabled: settings.enabled,
                    time: event.target.value,
                    timeZone: browserTimeZone,
                  })
                }
              />
            </SettingsField>
          </div>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
}
