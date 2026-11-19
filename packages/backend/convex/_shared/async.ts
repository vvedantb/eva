/** Resolves after `ms` milliseconds. Runtime-neutral (isolate and "use node"). */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
