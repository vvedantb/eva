import * as Clipboard from "expo-clipboard";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

let available = false;
let pasted = false;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

const emit = () => {
  for (const listener of listeners) listener();
};

const check = () => {
  Clipboard.hasImageAsync().then(
    (hasImage) => {
      const next = hasImage && !pasted;
      if (next === available) return;
      available = next;
      emit();
    },
    () => undefined,
  );
};

const recheck = () => {
  pasted = false;
  check();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!stop) {
    const clipboard = Platform.OS === "web" ? null : Clipboard.addClipboardListener(recheck);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") recheck();
    });
    stop = () => {
      clipboard?.remove();
      appState.remove();
    };
    check();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
};

/** True while the clipboard holds an image not yet pasted. */
export function useClipboardHasImage(): boolean {
  return useSyncExternalStore(subscribe, () => available);
}

/**
 * The clipboard's image as PNG (the web pastes the original too), or null
 * when it no longer holds one. Hides the chip until the clipboard changes.
 */
export async function takeClipboardImage(): Promise<{ base64: string; mimeType: string } | null> {
  const image = await Clipboard.getImageAsync({ format: "png" });
  pasted = true;
  available = false;
  emit();
  if (!image) return null;
  const comma = image.data.indexOf(",");
  return { base64: comma === -1 ? image.data : image.data.slice(comma + 1), mimeType: "image/png" };
}
