/** Message text of an Error, or `String(value)` for anything else. Runtime-neutral (isolate and "use node"). */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
