"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  useConvexAuth,
  useMutation,
  AuthLoading,
  Authenticated,
  Unauthenticated,
} from "convex/react";
import usePresence from "@convex-dev/presence/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/clerk-react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import { BlurPidEffect } from "@/lib/components/BlurPidEffect";
import { PageMotionProvider } from "@/lib/components/PageMotionProvider";
import { FaviconController } from "@/lib/components/FaviconController";
import { ThemeModeProvider } from "@/lib/components/ThemeModeProvider";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { WelcomeSetupDialog } from "./onboarding/WelcomeSetupDialog";
import { convex } from "@/lib/convex";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

// Tracks whether the user has been signed in during this page session.
// Used by useStableAuth to detect unexpected auth loss (stale deployment).
let wasEverSignedIn = false;

/**
 * Wraps Clerk's useAuth to debounce unexpected auth loss.
 *
 * When Vercel deploys a new version, stale JS can break Clerk's internals,
 * causing it to report isSignedIn:false even though the user has a valid session.
 * ConvexProviderWithClerk then clears the auth token, and the Convex server
 * re-evaluates every active subscription without auth â€” producing a burst of
 * "Not authenticated" errors in the Convex logs.
 *
 * To prevent this: when auth drops from signed-in â†’ not-signed-in, we tell
 * Convex "auth is still loading" for 2 seconds. During that window:
 * - Stale deployment: page reloads, WebSocket closes, subscriptions drop cleanly
 * - Real logout: routes unmount via InnerApp/router (which reads Clerk directly),
 *   subscriptions are cleaned up, then the timer fires and propagates the real state
 *
 * In both cases Convex never re-evaluates subscriptions without auth.
 */
function useStableAuth() {
  const auth = useAuth();
  const [overrideLoading, setOverrideLoading] = useState(false);

  useEffect(() => {
    if (auth.isSignedIn) {
      wasEverSignedIn = true;
      setOverrideLoading(false);
      return;
    }

    // Was signed in and now not â€” debounce to avoid Convex auth cascade
    if (wasEverSignedIn && auth.isLoaded && !auth.isSignedIn) {
      setOverrideLoading(true);
      const timer = setTimeout(() => {
        wasEverSignedIn = false;
        setOverrideLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }

    setOverrideLoading(false);
  }, [auth.isLoaded, auth.isSignedIn]);

  if (overrideLoading) {
    return { ...auth, isLoaded: false };
  }
  return auth;
}

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);

  useEffect(() => {
    if (isAuthenticated) {
      ensureUserExists({}).catch(console.error);
    }
  }, [isAuthenticated, ensureUserExists]);

  return null;
}

function PresenceHeartbeat() {
  const userId = useQuery(api.auth.me);
  if (!userId) return null;
  return <PresenceInner userId={userId} />;
}

function PresenceInner({ userId }: { userId: Id<"users"> }) {
  usePresence(api.presence, "platform", userId);
  const location = useLocation();
  const updatePath = useMutation(api.presence.updatePath);
  const lastPathRef = useRef("");

  useEffect(() => {
    const path = location.pathname;
    if (path !== lastPathRef.current) {
      lastPathRef.current = path;
      updatePath({ path }).catch(() => {});
    }
  }, [location.pathname, updatePath]);

  return null;
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  "use no memo";
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useStableAuth}>
      <ConvexQueryCacheProvider>
        <EnsureUser />
        <ThemeModeProvider>
          <PageMotionProvider>
            {children}
            <FaviconController />
          </PageMotionProvider>
        </ThemeModeProvider>
      </ConvexQueryCacheProvider>
    </ConvexProviderWithClerk>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <AuthLoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <Navigate to="/" />
      </Unauthenticated>
      <Authenticated>
        {/* TooltipProvider lives in `__root`, above the layers that render
            outside this gate. */}
        <ThemeProvider>
          {children}
          <BlurPidEffect />
          <PresenceHeartbeat />
          <WelcomeSetupDialog />
        </ThemeProvider>
      </Authenticated>
    </>
  );
}
