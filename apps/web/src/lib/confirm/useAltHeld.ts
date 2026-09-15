import { useSyncExternalStore } from "react";

/**
 * Whether Alt (Option on macOS) is held right now.
 *
 * Subscribes to the window so every confirmable control can restyle when the
 * modifier goes down, and so Alt+click still works when the activating event
 * is a Radix `onSelect` that does not carry `altKey`.
 *
 * Cleared on blur / visibility hide so a missed keyup after alt-tab cannot
 * leave the app stuck in skip-confirm mode.
 */

/** The only two fields the store reads off a keyboard event. */
export type AltKeyEvent = { key: string; altKey: boolean };

/** What the binding feeds the store. `clear` is any event that can swallow a keyup. */
export type AltHeldSignals = {
  keyDown: (event: AltKeyEvent) => void;
  keyUp: (event: AltKeyEvent) => void;
  clear: () => void;
};

/** Wires the signals to a real event source and returns the unbind. */
export type AltHeldBinding = (signals: AltHeldSignals) => () => void;

export type AltHeldStore = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => boolean;
};

/**
 * The binding is injected so the state machine can be driven without a DOM.
 * Listeners attach lazily and, crucially, the held flag resets when the last
 * subscriber leaves: with nothing bound, a keyup can no longer be observed, so
 * a flag left at `true` would survive into the next mount and silently skip the
 * confirmation dialog on a plain click.
 */
export function createAltHeldStore(bind: AltHeldBinding): AltHeldStore {
  let altHeld = false;
  let unbind: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function setHeld(next: boolean): void {
    if (altHeld === next) return;
    altHeld = next;
    for (const listener of listeners) listener();
  }

  const signals: AltHeldSignals = {
    keyDown: (event) => {
      if (event.key === "Alt" || event.altKey) setHeld(true);
    },
    keyUp: (event) => {
      // A keyup for some other key still reports altKey while Alt is down, so
      // only a released Alt — or a keyup without the modifier — clears.
      if (event.key === "Alt" || !event.altKey) setHeld(false);
    },
    clear: () => setHeld(false),
  };

  return {
    subscribe: (onStoreChange) => {
      if (unbind === null) unbind = bind(signals);
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size > 0) return;
        unbind?.();
        unbind = null;
        // Nothing is listening for the keyup any more; start the next mount
        // from a known-unheld state rather than a stale `true`.
        altHeld = false;
      };
    },
    getSnapshot: () => altHeld,
  };
}

const bindToWindow: AltHeldBinding = (signals) => {
  if (typeof window === "undefined") return () => {};
  const onKeyDown = (event: KeyboardEvent): void => signals.keyDown(event);
  const onKeyUp = (event: KeyboardEvent): void => signals.keyUp(event);
  const onBlur = (): void => signals.clear();
  const onVisibilityChange = (): void => {
    if (document.hidden) signals.clear();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};

const altHeldStore = createAltHeldStore(bindToWindow);

export function useAltHeld(): boolean {
  return useSyncExternalStore(
    altHeldStore.subscribe,
    altHeldStore.getSnapshot,
    () => false,
  );
}
