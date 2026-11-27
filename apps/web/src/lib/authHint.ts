const KEY = "eva:signed-in-hint";

/**
 * Last known Clerk auth state, persisted so the next boot can decide whether
 * to hold first paint for the session handshake (returning signed-in user)
 * or render the anonymous landing immediately (first-time / signed-out
 * visitor). A stale hint is only a heuristic: main.tsx re-checks against the
 * real Clerk state once it loads and re-runs route guards if they disagree.
 */
export function readSignedInHint(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSignedInHint(signedIn: boolean): void {
  try {
    localStorage.setItem(KEY, signedIn ? "1" : "0");
  } catch {
    // Storage unavailable (private mode etc.) — boot falls back to holding paint.
  }
}
