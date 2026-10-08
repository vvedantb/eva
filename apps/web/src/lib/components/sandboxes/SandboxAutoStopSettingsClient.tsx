"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Input,
  Spinner,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import type { SandboxIdlePauseMode } from "@eva/shared";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { catchMutationError } from "@/lib/utils/mutationToast";

const IDLE_PAUSE_MODES: ReadonlyArray<{
  value: SandboxIdlePauseMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
  { value: "dry-run", label: "Dry run" },
  { value: "on", label: "On" },
];

function isIdlePauseMode(value: string): value is SandboxIdlePauseMode {
  return IDLE_PAUSE_MODES.some((mode) => mode.value === value);
}

/**
 * App-wide sandbox settings. Two independent sweeps:
 *
 * - Daily auto-stop: the entered time is interpreted in the browser's timezone
 *   (captured on save) and a backend cron stops every running sandbox then.
 * - Idle pause: a 5-minute cron pauses any sandbox whose agent has finished and
 *   that nobody has touched for the configured grace. "Dry run" only logs what
 *   it would pause, so the rule can be watched before it acts.
 *
 * Both bind directly to their Convex query with an optimistic update — no
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
  const idlePause = useQuery(api.sandboxIdlePause.getSandboxIdlePauseSettings);
  const saveIdlePause = useMutation(
    api.sandboxIdlePause.setSandboxIdlePauseSettings,
  ).withOptimisticUpdate((localStore, args) => {
    localStore.setQuery(
      api.sandboxIdlePause.getSandboxIdlePauseSettings,
      {},
      args,
    );
  });

  if (settings === undefined || idlePause === undefined) {
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

  const saveIdlePauseSettings = (args: {
    mode: SandboxIdlePauseMode;
    afterAgentMinutes: number;
    afterInteractionMinutes: number;
  }) =>
    catchMutationError(
      saveIdlePause(args),
      "Couldn't save idle pause settings",
      "sandbox-idle-pause",
    );

  /** Minutes inputs save on change; an empty or sub-1 value is left alone. */
  const minutesFromInput = (value: string): number | null => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  };

  return (
    <SettingsPage title="Sandboxes">
      <SettingsSection
        title="Idle pause"
        description="Pause sandboxes nobody is using. Opening a sandbox tab, sending a message or visiting a preview link wakes them again."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Mode"
          description="Dry run only logs which sandboxes would pause."
          action={
            <Tabs
              value={idlePause.mode}
              onValueChange={(value) => {
                if (!isIdlePauseMode(value)) return;
                void saveIdlePauseSettings({ ...idlePause, mode: value });
              }}
            >
              <TabsList size="sm" aria-label="Idle pause mode">
                {IDLE_PAUSE_MODES.map((mode) => (
                  <TabsTrigger key={mode.value} value={mode.value}>
                    {mode.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />
        <AnimatePresence initial={false}>
          {idlePause.mode !== "off" ? (
            <m.div
              key="sandbox-idle-pause-thresholds"
              className="flex flex-col gap-4 px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <SettingsField
                label="Pause after the agent finishes"
                description="Minutes a sandbox stays up once the last agent turn ends."
              >
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  defaultValue={idlePause.afterAgentMinutes}
                  onChange={(event) => {
                    const minutes = minutesFromInput(event.target.value);
                    if (minutes === null) return;
                    void saveIdlePauseSettings({
                      ...idlePause,
                      afterAgentMinutes: minutes,
                    });
                  }}
                />
              </SettingsField>
              <SettingsField
                label="Pause after the last interaction"
                description="Minutes since someone last sent a message, opened a sandbox tab or loaded the preview. Whichever grace ends later wins."
              >
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  defaultValue={idlePause.afterInteractionMinutes}
                  onChange={(event) => {
                    const minutes = minutesFromInput(event.target.value);
                    if (minutes === null) return;
                    void saveIdlePauseSettings({
                      ...idlePause,
                      afterInteractionMinutes: minutes,
                    });
                  }}
                />
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
                  enabled: checked,
                  time: settings.time,
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
                      enabled: settings.enabled,
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
