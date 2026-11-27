import { useSyncExternalStore } from "react";

/**
 * OS-level pop-ups for inbox notifications while an Eva window is open but
 * not focused (another app in front, minimised, background tab).
 *
 * Per device, not a Convex flag: the browser grants permission per device, so
 * a synced flag would read "on" on a laptop that never allowed it. The
 * localStorage opt-in lets someone switch it off without revoking the
 * browser permission.
 *
 * Only works while an Eva window is open. Delivering with Eva closed needs
 * Web Push — see internal/desktop-notifications-web-push.md.
 */

const STORAGE_KEY = "eva-desktop-notifications";

type EnableResult = "granted" | "denied" | "unsupported";

const listeners = new Set<() => void>();

function isSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isDesktopNotificationsEnabled(): boolean {
  return (
    isSupported() &&
    Notification.permission === "granted" &&
    localStorage.getItem(STORAGE_KEY) === "on"
  );
}

function setOptIn(on: boolean): void {
  if (on) localStorage.setItem(STORAGE_KEY, "on");
  else localStorage.removeItem(STORAGE_KEY);
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // Another tab toggling it.
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function useDesktopNotifications(): {
  supported: boolean;
  enabled: boolean;
} {
  const enabled = useSyncExternalStore(
    subscribe,
    isDesktopNotificationsEnabled,
    () => false,
  );
  return { supported: isSupported(), enabled };
}

/** Must run from a click: browsers only show the permission prompt then. */
export async function enableDesktopNotifications(): Promise<EnableResult> {
  if (!isSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  setOptIn(true);
  return "granted";
}

export function disableDesktopNotifications(): void {
  setOptIn(false);
}

/**
 * `tag` is the notification id, so every open Eva tab announcing the same row
 * replaces one OS pop-up rather than stacking duplicates.
 */
export function showDesktopNotification({
  id,
  title,
  body,
  onClick,
}: {
  id: string;
  title: string;
  body: string | undefined;
  onClick: () => void;
}): void {
  const popup = new Notification(title, { body, tag: id, icon: "/icon.png" });
  popup.onclick = () => {
    window.focus();
    onClick();
    popup.close();
  };
}
