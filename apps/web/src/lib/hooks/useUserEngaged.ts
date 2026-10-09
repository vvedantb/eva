import { useSyncExternalStore } from "react";
import { SANDBOX_ENGAGED_WINDOW_MS, isSandboxUserEngaged } from "@eva/shared";

/**
 * Input that proves a person is at this tab. `pointermove` is throttled below;
 * `scroll` does not bubble, so every listener uses the capture phase.
 */
const INPUT_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

/** Skip the timer reset for input this close to the last one (pointermove floods). */
const INPUT_THROTTLE_MS = 1_000;

const listeners = new Set<() => void>();
let lastInputAt = 0;
let engaged = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function recompute(): void {
  const next = isSandboxUserEngaged({
    visible: document.visibilityState === "visible",
    lastInputAt,
    now: Date.now(),
  });
  if (next === engaged) return;
  engaged = next;
  for (const listener of listeners) listener();
}

function noteInput(): void {
  const now = Date.now();
  if (engaged && now - lastInputAt < INPUT_THROTTLE_MS) return;
  lastInputAt = now;
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(recompute, SANDBOX_ENGAGED_WINDOW_MS);
  recompute();
}

/** Switching to the tab is a deliberate act; hiding it ends engagement now. */
function onVisibilityChange(): void {
  if (document.visibilityState === "visible") noteInput();
  else recompute();
}

/**
 * Input inside a cross-origin iframe (Preview, editor) never reaches this
 * document. Focus moving into one is the last signal we see, so count it.
 */
function onWindowBlur(): void {
  setTimeout(() => {
    if (document.activeElement instanceof HTMLIFrameElement) noteInput();
  }, 0);
}

function start(): void {
  for (const type of INPUT_EVENTS) {
    window.addEventListener(type, noteInput, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", onWindowBlur);
  // Mounting a sandbox tab means someone just opened or navigated to it.
  noteInput();
}

function stop(): void {
  for (const type of INPUT_EVENTS) {
    window.removeEventListener(type, noteInput, { capture: true });
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("blur", onWindowBlur);
  clearTimeout(expiryTimer);
  engaged = false;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) stop();
  };
}

/**
 * True while this tab is visible AND had input in the last
 * `SANDBOX_ENGAGED_WINDOW_MS`. A visible but untouched tab (an unattended
 * screen) reads false, so it stops holding or waking an idle sandbox.
 */
export function useUserEngaged(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => engaged,
    () => true,
  );
}
