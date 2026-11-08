import { api } from "@eva/backend";
import { getExpoPushToken, useExpoPushRegistration } from "@vvedantb/native-ui/push";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";

/** The Expo push token for this device, or null when push is not possible. */
export function getPushToken({ ask }: { ask: boolean }): Promise<string | null> {
  return getExpoPushToken({ ask });
}

/**
 * Signed-in side effects of push, mounted once under the auth gate: registers
 * this device's token with the backend and opens the chat when the user taps a
 * push (cold start included). The backend puts the chat id in `data.target`.
 */
export function usePush() {
  const register = useMutation(api.push.register);
  const router = useRouter();
  useExpoPushRegistration({
    register,
    onNotificationTap: ({ data }) => {
      const { target } = data;
      if (typeof target === "string" && target !== "") {
        router.push({ pathname: "/chat/[target]", params: { target } });
      }
    },
  });
}
