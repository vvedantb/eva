import { api } from "@eva/backend";
import { useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { Platform } from "react-native";
import { type LastCrash, useLastCrash } from "@/logging/lastCrash";

/** The `at` of the last crash sent, so each crash is sent once. */
const REPORTED_KEY = "eva.lastCrashReported";

type Send = (report: LastCrash & { platform: string }) => Promise<null>;

/** Sends `crash` unless it was sent before. Never throws: a failed send retries next launch. */
async function reportOnce(crash: LastCrash, send: Send) {
  try {
    const reported = Number((await SecureStore.getItemAsync(REPORTED_KEY)) ?? 0);
    if (crash.at <= reported) return;
    await send({ ...crash, platform: Platform.OS });
    await SecureStore.setItemAsync(REPORTED_KEY, String(crash.at));
  } catch {
    // A crash reporter must never throw.
  }
}

/**
 * Sends the crash that `LastCrashDialog` shows to the backend
 * (`crashReports.report`, which logs it to Axiom), so a crash is known without
 * the user pasting Copy details. Mounted under the auth gate, so the report
 * names the user. The effect syncs with an external system (the backend) when
 * the loaded crash appears; there is no event to hang it on.
 */
export function useReportLastCrash() {
  const crash = useLastCrash();
  const send = useMutation(api.crashReports.report);
  useEffect(() => {
    if (crash) void reportOnce(crash, send);
  }, [crash, send]);
}
