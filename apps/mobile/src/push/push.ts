import { api } from "@eva/backend";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { Platform } from "react-native";
import { z } from "zod";

/** Shows pushes as banners while the app is open too. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const pushDataSchema = z.object({ target: z.string().min(1) });

/** The chat a push opens, from the `target` push.ts puts in `data`. */
function targetFrom(response: Notifications.NotificationResponse | null): string | null {
  const parsed = pushDataSchema.safeParse(response?.notification.request.content.data);
  return parsed.success ? parsed.data.target : null;
}

/**
 * The Expo push token for this device, or null when push is not possible: an
 * emulator without Play services, no permission, or no EAS project id yet.
 * `ask` shows the permission prompt when it was never answered.
 */
export async function getPushToken({ ask }: { ask: boolean }): Promise<string | null> {
  if (!Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || projectId === "") return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Eva",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.granted || (ask && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // No google-services.json in this build: FCM cannot issue a token.
    return null;
  }
}

/**
 * Signed-in side effects of push, mounted once under the auth gate:
 * - registers this device's token with the backend;
 * - opens the chat when the user taps a push (cold start included).
 * Effects are right here: both sync with systems outside React.
 */
export function usePush() {
  const register = useMutation(api.push.register);
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  const tappedTarget = targetFrom(lastResponse ?? null);
  // Two taps on pushes for the same chat are two responses: key on the id.
  const tappedId = lastResponse?.notification.request.identifier;

  useEffect(() => {
    void getPushToken({ ask: true }).then((token) => {
      if (token) void register({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
    });
  }, [register]);

  useEffect(() => {
    if (tappedTarget) router.push({ pathname: "/chat/[target]", params: { target: tappedTarget } });
  }, [tappedId, tappedTarget, router]);
}
