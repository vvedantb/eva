"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  useMutation,
  AuthLoading,
  Authenticated,
  Unauthenticated,
} from "convex/react";
import usePresence from "@convex-dev/presence/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import { BlurPidEffect } from "@/lib/components/BlurPidEffect";
import { PageMotionProvider } from "@/lib/components/PageMotionProvider";
import { FaviconController } from "@/lib/components/FaviconController";
import { ThemeModeProvider } from "@/lib/components/ThemeModeProvider";
import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import {
  ensureRuntimeVisibility,
  useEnsureUser,
  useStableAuth,
} from "@vvedantb/ui";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { MaintenanceGate } from "./MaintenanceScreen";
import { WelcomeSetupDialog } from "./onboarding/WelcomeSetupDialog";
import { convex } from "@/lib/convex";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

ensureRuntimeVisibility();

function EnsureUser() {
  useEnsureUser(api.auth.ensureUserExists);
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

/**
 * How long an unused query stays subscribed, and how many may wait. The
 * library defaults (5 min, 250) kept every full transcript a session switch
 * left behind live in memory and still receiving updates. 1 min covers a
 * quick switch back; older sessions reload their tail first.
 */
const QUERY_CACHE_EXPIRATION_MS = 60_000;
const QUERY_CACHE_MAX_IDLE_ENTRIES = 50;

export function ClientProvider({ children }: { children: React.ReactNode }) {
  "use no memo";
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useStableAuth}>
      <ConvexQueryCacheProvider
        expiration={QUERY_CACHE_EXPIRATION_MS}
        maxIdleEntries={QUERY_CACHE_MAX_IDLE_ENTRIES}
      >
        <EnsureUser />
        <ThemeModeProvider>
          <PageMotionProvider>
            <MaintenanceGate>{children}</MaintenanceGate>
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
