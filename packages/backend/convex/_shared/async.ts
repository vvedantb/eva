/** Resolves after `ms` milliseconds. Runtime-neutral (isolate and "use node"). */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Races `promise` against a timer; rejects with `makeError()` if the timer fires first. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  makeError: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(makeError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
