/**
 * Web build (previews and screenshots only): no push. expo-notifications has
 * no web implementation of `useLastNotificationResponse`, and calling it
 * throws. Metro picks this file over push.ts for web.
 */
export async function getPushToken(_options: { ask: boolean }): Promise<string | null> {
  return null;
}

export function usePush() {}
