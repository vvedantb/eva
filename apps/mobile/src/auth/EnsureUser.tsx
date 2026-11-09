import { api } from "@eva/backend";
import { CenteredSpinner } from "@vvedantb/native-ui/primitives";
import { useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";

/** One call per app run: every signed-in layout shares it. */
let ensured: Promise<unknown> | null = null;

/**
 * Creates the Eva user row on first sign-in (`auth.ensureUserExists`, what the
 * web's `useEnsureUser` calls) before any auth query runs: a Clerk user who
 * never opened the web app has no row, and every `authQuery` would throw.
 * The effect is the right tool here: it syncs with the server once on mount.
 */
export function EnsureUser({ children }: { children: ReactNode }) {
  const ensureUserExists = useMutation(api.auth.ensureUserExists);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensured ??= ensureUserExists({}).catch((error: unknown) => {
      ensured = null;
      throw error;
    });
    let live = true;
    ensured.then(() => live && setReady(true)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ensureUserExists]);
  return ready ? children : <CenteredSpinner label="Signing in" />;
}
