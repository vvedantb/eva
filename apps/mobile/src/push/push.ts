import { api } from "@eva/backend";
import { getExpoPushToken, useExpoPushRegistration } from "@vvedantb/native-ui/push";
import { useMutation, useQuery } from "convex/react";
import { setBadgeCountAsync } from "expo-notifications";
import { useEffect } from "react";
import { openAppLink } from "@/push/openLink";

/** The Expo push token for this device, or null when push is not possible. */
export function getPushToken({ ask }: { ask: boolean }): Promise<string | null> {
  return getExpoPushToken({ ask });
}

/** A push data field as text, or undefined when it is not a non-empty string. */
const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

/**
 * Signed-in side effects of push, mounted once under the auth gate: registers
 * this device's token with the backend and opens the chat when the user taps a
 * push (cold start included): `data.target` is a chat (`data.thread` a reply
 * thread in it), else `data.href` and
 * `data.repoId` name a task, project, PR or doc (`openAppLink`).
 */
export function usePush() {
  const register = useMutation(api.push.register);
  useExpoPushRegistration({
    register,
    // A reply thread (`thread` in `target`), a chat (`target`), else the screen the notification's link names (`href`, `repoId`), else the web.
    onNotificationTap: ({ data }) => {
      openAppLink({
        chatTarget: text(data.target),
        threadRootId: text(data.thread),
        href: text(data.href),
        repoId: text(data.repoId),
      });
    },
  });
}

/**
 * The app-icon badge is the Needs you count, as the web tab and favicon
 * (`needsYou.list`). An effect, because the badge is outside React. It
 * updates while the app runs; some Android launchers show no number.
 */
export function useAppBadge() {
  const count = useQuery(api.needsYou.list, {})?.length;
  useEffect(() => {
    if (count !== undefined) void setBadgeCountAsync(count);
  }, [count]);
}

/** Clears the badge on sign-out, so the next account does not see this one's count. */
export async function clearAppBadge(): Promise<void> {
  await setBadgeCountAsync(0);
}
