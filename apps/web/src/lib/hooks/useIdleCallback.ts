import { useRef } from "react";

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
  // The latest-ref write and the lazy init both happen during render, which
  // `react/refs` flags. `useEffect` and `useMemo` are banned here (CLAUDE.md),
  // and both writes are idempotent and unread by the render itself, so the
  // component still paints from props alone. Same shape as `useHeldQuery`.
  const latest = useRef(fn);
  latest.current = fn;
  const debounced = useRef<((...args: Args) => void) | null>(null);
  debounced.current ??= createIdleCallback(ms, () => latest.current);
  return debounced.current;
}
