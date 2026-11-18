import { api, type Id } from "@eva/backend";
import {
  MID_TURN_SLEEP_HINT,
  sandboxDisplayStatus,
  SLEEP_EVA_LABEL,
  WAKE_EVA_LABEL,
  WAKE_EVA_RETRY_LABEL,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconAlertTriangle, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react-native";
import { Button, Spinner } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { useScheme } from "@/ui/theme";

/**
 * A session's sandbox, as the web session header reads and drives it
 * (`SandboxStartStopButton`, `useSandboxLifecycle`): whether it is awake, a
 * failed wake (`sandboxDisplayStatus` "error"), and a wake or sleep in flight.
 * No session (a task or project chat): never loaded, so nothing shows.
 */
export function useSessionSandbox(sessionId: Id<"sessions"> | undefined) {
  const session = useQuery(api.sessions.get, sessionId ? { id: sessionId } : "skip");
  const start = useMutation(api.sessions.startSandbox);
  // The shared Stop (`stopWorkSandbox`): refused while an agent, run, build
  // or interview holds the session, as on the web.
  const stop = useMutation(api.sessions.stopWorkSandbox);
  const [pending, setPending] = useState<"start" | "stop" | null>(null);
  const display = session ? sandboxDisplayStatus(session) : undefined;
  const run = async (action: "start" | "stop") => {
    if (!sessionId) return;
    setPending(action);
    try {
      await (action === "start"
        ? start({ sessionId })
        : stop({ target: { sessionId } }));
    } catch {
      toast.error(action === "start" ? "Couldn't start sandbox" : "Couldn't stop sandbox");
    }
    setPending(null);
  };
  return {
    loaded: session !== undefined && session !== null,
    isActive: display === "active",
    isToggling: pending !== null || display === "starting" || display === "stopping",
    /** Going to sleep: the empty chat says so, as the web. */
    isStopping: pending === "stop" || display === "stopping",
    startError: display === "error" ? (session?.sandboxError ?? undefined) : undefined,
    toggle: (action: "start" | "stop") => void run(action),
  };
}

type SessionSandbox = ReturnType<typeof useSessionSandbox>;

/**
 * The web header's wake / sleep control as a 44 round header button: a green
 * play to wake Eva (a retry after a failed wake), a red stop to put her to
 * sleep, a spinner while either runs. Mid-turn it stays, dimmed, and says to
 * stop Eva first, as the web (sleeping mid-turn leaves the turn hanging). In
 * simple view it shows only where nothing else wakes Eva: a failed wake, or
 * idle pause not "on".
 */
export function SandboxControl({ sandbox, working }: { sandbox: SessionSandbox; working: boolean }) {
  const theme = EVA_THEME[useScheme()];
  const simpleView = useSimpleView();
  const idlePause = useQuery(api.sandboxIdlePause.getSandboxIdlePauseSettings, simpleView ? {} : "skip");
  if (!sandbox.loaded) return null;
  const autoWakes = idlePause === undefined || idlePause.mode === "on";
  if (simpleView && (sandbox.isActive || (sandbox.startError === undefined && autoWakes))) return null;
  const blockedMidTurn = sandbox.isActive && working;
  const label = sandbox.isActive ? SLEEP_EVA_LABEL : sandbox.startError !== undefined ? WAKE_EVA_RETRY_LABEL : WAKE_EVA_LABEL;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={blockedMidTurn ? MID_TURN_SLEEP_HINT : undefined}
      accessibilityState={{ disabled: sandbox.isToggling || blockedMidTurn, busy: sandbox.isToggling }}
      disabled={sandbox.isToggling}
      onPress={() => {
        if (blockedMidTurn) {
          toast(MID_TURN_SLEEP_HINT);
          return;
        }
        sandbox.toggle(sandbox.isActive ? "stop" : "start");
      }}
      hitSlop={4}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
      style={{
        backgroundColor: sandbox.isActive ? theme.destructive : theme.secondary,
        opacity: blockedMidTurn ? 0.45 : 1,
      }}
    >
      {sandbox.isToggling ? (
        <Spinner size="sm" />
      ) : sandbox.isActive ? (
        <IconPlayerStop size={16} color={theme.destructiveForeground} />
      ) : (
        <IconPlayerPlay size={16} color={theme.success} />
      )}
    </Pressable>
  );
}

/** The web `SandboxErrorNotice` under the header: why Eva did not wake, and "Try again" (the same start). */
export function SandboxErrorBanner({ sandbox }: { sandbox: SessionSandbox }) {
  const theme = EVA_THEME[useScheme()];
  if (sandbox.startError === undefined) return null;
  return (
    <View
      accessibilityRole="alert"
      className="mx-3 mb-2 flex-row items-center gap-2 rounded-xl px-3 py-2"
      style={{ backgroundColor: withAlpha(theme.destructive, 0.1) }}
    >
      <IconAlertTriangle size={16} color={theme.destructive} />
      <View className="min-w-0 flex-1">
        <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          Eva couldn&apos;t wake up
        </Text>
        <Text numberOfLines={2} className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
          {sandbox.startError}
        </Text>
      </View>
      <Button size="sm" variant="secondary" fullWidth={false} loading={sandbox.isToggling} disabled={sandbox.isToggling} onPress={() => sandbox.toggle("start")}>
        Try again
      </Button>
    </View>
  );
}
