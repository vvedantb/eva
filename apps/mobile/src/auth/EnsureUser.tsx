import { api } from "@eva/backend";
import { useAuth } from "@clerk/clerk-expo";
import { IconAlertTriangle } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/button";
import { CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { AccountThemeSync } from "@/settings/themeMode";

/** Milliseconds `ensureUserExists` may take before the screen shows an error. */
export const ENSURE_USER_TIMEOUT_MS = 20_000;

type State = { kind: "pending" } | { kind: "ready" } | { kind: "error"; code: string; message: string };

/** One call per app run: every signed-in layout shares it. */
let ensured: Promise<void> | null = null;
/** Set once `useConvexAuth().isAuthenticated` is true. Read by the failure log. */
let convexAuthSeen = false;

function timeoutAfter(ms: number): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout_ensureUser")), ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

function describe<Caught>(caught: Caught): { code: string; message: string } {
  const name = caught instanceof Error ? caught.name : typeof caught;
  const text = caught instanceof Error ? caught.message : "";
  if (text === "timeout_ensureUser") return { code: "timeout_ensureUser", message: "Setting up your account took too long." };
  return { code: `ensureUser_${name}`, message: text.slice(0, 120) || "Could not set up your account." };
}

/**
 * Creates the Eva user row on first sign-in (`auth.ensureUserExists`, what the
 * web's `useEnsureUser` calls) before any auth query runs: a Clerk user who
 * never opened the web app has no row, and every `authQuery` would throw.
 * The effect is the right tool here: it syncs with the server once on mount.
 * A failure or a 20 s wait shows an error with Retry and Sign out, never a
 * spinner without end.
 *
 * Note: native-ui `AuthProviders` is `ClerkProvider` > `ConvexProviderWithClerk`
 * with its default `useAuth` from `@clerk/clerk-expo`. Mobile and native-ui
 * resolve one copy of `@clerk/clerk-expo` (one entry in `node_modules/.pnpm`,
 * checked 2026-11-09). A second copy would leave Convex without Clerk
 * auth, so `isAuthenticated` below would stay false.
 */
export function EnsureUser({ children }: { children: ReactNode }) {
  const ensureUserExists = useMutation(api.auth.ensureUserExists);
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuth();
  const [state, setState] = useState<State>({ kind: "pending" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || convexAuthSeen) return;
    convexAuthSeen = true;
    console.info("[ensure-user] convex auth is authenticated");
  }, [isAuthenticated]);

  useEffect(() => {
    if (!ensured) {
      const timeout = timeoutAfter(ENSURE_USER_TIMEOUT_MS);
      ensured = Promise.race([ensureUserExists({}).then(() => undefined), timeout.promise])
        .finally(timeout.clear)
        .catch((error) => {
          ensured = null;
          const { code, message } = describe(error);
          console.error("[ensure-user] failure", { stage: "ensureUser", code, message, convexAuthSeen });
          throw error;
        });
    }
    let live = true;
    ensured.then(
      () => live && setState({ kind: "ready" }),
      (error) => live && setState({ kind: "error", ...describe(error) }),
    );
    return () => {
      live = false;
    };
  }, [ensureUserExists, attempt]);

  if (state.kind === "ready")
    return (
      <>
        {children}
        {/* The account's appearance mode needs the user row, so it waits for it here. */}
        <AccountThemeSync />
      </>
    );
  if (state.kind === "pending") return <CenteredSpinner label="Signing in" />;
  return (
    <EmptyState.Root>
      <EmptyState.Icon icon={IconAlertTriangle} />
      <EmptyState.Title>Could not finish signing in</EmptyState.Title>
      <EmptyState.Description>{`${state.message} (code: ${state.code})`}</EmptyState.Description>
      <EmptyState.Actions>
        <Button
          onPress={() => {
            setState({ kind: "pending" });
            setAttempt(attempt + 1);
          }}
        >
          Retry
        </Button>
        <Button variant="ghost" onPress={() => void signOut().catch((error) => console.error("[ensure-user] sign out failed", describe(error)))}>
          Sign out
        </Button>
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}
