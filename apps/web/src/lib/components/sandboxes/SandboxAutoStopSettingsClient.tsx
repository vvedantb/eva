"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { catchMutationError } from "@/lib/utils/mutationToast";

/** Idle thresholds offered in the picker, in minutes. */
const IDLE_MINUTE_OPTIONS = [15, 30, 60, 120, 240, 480];

function formatIdleMinutes(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

type SandboxAutoStopSettings = {
  enabled: boolean;
  time: string;
  timeZone: string;
  idleEnabled: boolean;
  idleMinutes: number;
};

/**
 * App-wide sandbox stop settings. Two sweeps share one row:
 * - Daily auto-stop: the entered time is interpreted in the browser's timezone
 *   (captured on save) and a backend cron stops every running sandbox at that
 *   time each day.
 * - Idle auto-stop: a cron stops any sandbox with no chat or agent activity for
 *   the chosen idle time.
 * Binds directly to the Convex query with an optimistic update — no local form
 * state.
 */
export function SandboxAutoStopSettingsClient() {
  const settings = useQuery(api.sandboxAutoStop.getSandboxAutoStopSettings);
  const save = useMutation(
    api.sandboxAutoStop.setSandboxAutoStopSettings,
  ).withOptimisticUpdate((localStore, args) => {
    localStore.setQuery(api.sandboxAutoStop.getSandboxAutoStopSettings, {}, {
      enabled: args.enabled,
      time: args.time,
      timeZone: args.timeZone,
      idleEnabled: args.idleEnabled,
      idleMinutes: args.idleMinutes,
    });
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

  const saveSettings = (args: SandboxAutoStopSettings) =>
    catchMutationError(
      save(args),
      "Couldn't save sandbox settings",
      "sandbox-autostop",
    );

  // A threshold saved outside the preset list still has to show in the picker.
  const idleOptions = IDLE_MINUTE_OPTIONS.includes(settings.idleMinutes)
    ? IDLE_MINUTE_OPTIONS
    : [...IDLE_MINUTE_OPTIONS, settings.idleMinutes].sort((a, b) => a - b);

  return (
    <SettingsPage title="Sandboxes">
      <SettingsSection
        title="Idle auto-stop"
        description="Stop a sandbox that has had no chat or agent activity for a while."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Enabled"
          description="Messages, agent turns and builds count as activity. Terminal or preview use on its own does not."
          action={
            <Switch
              checked={settings.idleEnabled}
              onCheckedChange={(checked) =>
                saveSettings({ ...settings, idleEnabled: checked })
              }
              aria-label="Idle auto-stop"
            />
          }
        />
        <AnimatePresence initial={false}>
          {settings.idleEnabled ? (
            <m.div
              key="sandbox-idlestop-minutes"
              className="px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <SettingsField
                label="Idle time"
                description="The sweep runs every 5 minutes. A sandbox with a turn or build in progress is never stopped."
              >
                <Select
                  value={String(settings.idleMinutes)}
                  onValueChange={(value) =>
                    saveSettings({ ...settings, idleMinutes: Number(value) })
                  }
                >
                  <SelectTrigger className="w-40" aria-label="Idle time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {idleOptions.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {formatIdleMinutes(minutes)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>
            </m.div>
          ) : null}
        </AnimatePresence>
      </SettingsSection>

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
                  ...settings,
                  enabled: checked,
                  timeZone: browserTimeZone,
                })
              }
              aria-label="Daily auto-stop"
            />
          }
        />
        <AnimatePresence initial={false}>
          {settings.enabled ? (
            <m.div
              key="sandbox-autostop-time"
              className="px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
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
                      ...settings,
                      time: event.target.value,
                      timeZone: browserTimeZone,
                    })
                  }
                />
              </SettingsField>
            </m.div>
          ) : null}
        </AnimatePresence>
      </SettingsSection>
    </SettingsPage>
  );
}
