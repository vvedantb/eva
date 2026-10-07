/**
 * One timeout chain per interval, shared by every subscriber.
 *
 * Sidebar rows used to each own a `useQuantizedNow` timer; elapsed labels
 * each owned a 1s interval. The snapshot is still `floor(now / interval)`,
 * so the displayed value is unchanged — only the wake-ups collapse.
 *
 * The chain pauses while `document.hidden`: nothing on screen needs a tick,
 * and becoming visible notifies immediately so labels catch up in one paint.
 */

export type QuantizedStore = {
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | undefined;
  visHandler: (() => void) | undefined;
};

const stores = new Map<number, QuantizedStore>();

export function quantizedSnapshot(intervalMs: number, now = Date.now()): number {
  return Math.floor(now / intervalMs) * intervalMs;
}

export function msUntilNextBoundary(
  intervalMs: number,
  now = Date.now(),
): number {
  const remainder = now % intervalMs;
  return remainder === 0 ? intervalMs : intervalMs - remainder;
}

function pageHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

function disarmTimer(store: QuantizedStore): void {
  if (store.timer === undefined) return;
  clearTimeout(store.timer);
  store.timer = undefined;
}

function arm(store: QuantizedStore, intervalMs: number): void {
  disarmTimer(store);
  if (pageHidden() || store.listeners.size === 0) return;
  store.timer = setTimeout(() => {
    for (const listener of store.listeners) listener();
    arm(store, intervalMs);
  }, msUntilNextBoundary(intervalMs));
}

export function subscribeQuantized(
  intervalMs: number,
  onChange: () => void,
): () => void {
  let store = stores.get(intervalMs);
  if (!store) {
    store = { listeners: new Set(), timer: undefined, visHandler: undefined };
    stores.set(intervalMs, store);
  }
  store.listeners.add(onChange);
  if (store.listeners.size === 1) {
    arm(store, intervalMs);
    if (typeof document !== "undefined") {
      store.visHandler = () => {
        if (pageHidden()) {
          disarmTimer(store);
          return;
        }
        for (const listener of store.listeners) listener();
        arm(store, intervalMs);
      };
      document.addEventListener("visibilitychange", store.visHandler);
    }
  }
  return () => {
    store.listeners.delete(onChange);
    if (store.listeners.size > 0) return;
    disarmTimer(store);
    if (store.visHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", store.visHandler);
    }
    stores.delete(intervalMs);
  };
}

/** Test seam — how many listeners share `intervalMs`. */
export function quantizedListenerCount(intervalMs: number): number {
  return stores.get(intervalMs)?.listeners.size ?? 0;
}

/** Test seam — whether a timer is armed for `intervalMs`. */
export function quantizedTimerArmed(intervalMs: number): boolean {
  return stores.get(intervalMs)?.timer !== undefined;
}
