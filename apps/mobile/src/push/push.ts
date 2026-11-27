import { api } from "@eva/backend";
import { getExpoPushToken, useExpoPushRegistration } from "@vvedantb/native-ui/push";
import { useMutation } from "convex/react";
import { openAppLink } from "@/push/openLink";

/** The Expo push token for this device, or null when push is not possible. */
export function getPushToken({ ask }: { ask: boolean }): Promise<string | null> {
  return getExpoPushToken({ ask });
}

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

/**
 * Signed-in side effects of push, mounted once under the auth gate: registers
 * this device's token with the backend and opens the chat when the user taps a
 * push (cold start included): `data.target` is a chat, else `data.href` and
 * `data.repoId` name a task, project, PR or doc (`openAppLink`).
 */
export function usePush() {
  const register = useMutation(api.push.register);
  useExpoPushRegistration({
    register,
    onNotificationTap: ({ data }) => {
      openAppLink({ chatTarget: text(data.target), href: text(data.href), repoId: text(data.repoId) });
    },
  });
}
