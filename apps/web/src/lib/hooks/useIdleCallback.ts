import { useState } from "react";

/** Anything worth passing through a debounced callback. */
type CallbackArgs = ReadonlyArray<string | number | boolean | null | object>;

/**
 * The debounce itself, free of React so it can be tested with fake timers.
 * `getFn` is read at fire time rather than captured, so the caller always runs
 * the latest render's closure.
 */
export function createIdleCallback<Args extends CallbackArgs>(
  ms: number,
  getFn: () => (...args: Args) => void,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      getFn()(...args);
    }, ms);
  };
}

/**
 * Returns a stable callback that runs `fn` once `ms` has passed since the last
 * call; each call cancels the pending one. Trailing edge only — nothing fires
 * until the caller goes quiet.
 */
export function useIdleCallback<Args extends CallbackArgs>(
  ms: number,
  fn: (...args: Args) => void,
): (...args: Args) => void {
  // No refs and no direct writes to state: the React Compiler skips a file
  // that does either during render. The holder keeps the latest `fn` in a
  // closure; the caller stores it on each call (always an event handler
  // holding the current render's closure), and the timer reads it on fire.
  const [idle] = useState(() => {
    let current = fn;
    return {
      setFn: (next: (...args: Args) => void) => {
        current = next;
      },
      run: createIdleCallback<Args>(ms, () => current),
    };
  });
  return (...args: Args) => {
    idle.setFn(fn);
    idle.run(...args);
  };
}
