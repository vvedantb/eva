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
  tokenTransition,
  SettingsField,
  SettingsToggleRow,
  SettingsSection,
} from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import type { SandboxIdlePauseMode } from "@eva/shared";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { catchMutationError } from "@/lib/utils/mutationToast";

const IDLE_PAUSE_MODES: ReadonlyArray<{
  value: SandboxIdlePauseMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
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
 *   that nobody has touched for the configured grace.
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

  const minutesFromInput = (value: string): number | null => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  };

  return (
    <SettingsPage title="Sandboxes">
      <SettingsSection
        title="Idle pause"
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Mode"
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
              transition={tokenTransition.fast}
            >
              <SettingsField
                label="Pause after the agent finishes"
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
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Enabled"
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
              transition={tokenTransition.fast}
            >
              <SettingsField
                label="Stop time"
                description={settings.timeZone}
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
