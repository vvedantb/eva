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
