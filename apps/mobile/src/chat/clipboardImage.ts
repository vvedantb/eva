import * as Clipboard from "expo-clipboard";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

// Whether the clipboard holds an image the composer can paste, for the
// "Paste image" chip. `hasImageAsync` reads the clip's description only (its
// MIME types), so Android shows no "pasted from your clipboard" notice; only
// the paste itself reads the image.

let available = false;
// Set by a paste, so the same image is not offered again. Cleared when the
// clipboard changes, or when the app comes back (an image copied in another app).
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
    // No clipboard access (a web build without permission): no chip.
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
    // The web module has no clipboard events: its `addClipboardListener` throws.
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
  // `data` is a data URI: `data:image/png;base64,...`.
  const comma = image.data.indexOf(",");
  return { base64: comma === -1 ? image.data : image.data.slice(comma + 1), mimeType: "image/png" };
}
