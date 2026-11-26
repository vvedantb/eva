"use client";

import { Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import { isHiddenSandboxTab } from "@/lib/hooks/useSimpleView";

type HiddenSandboxTabRedirectTo =
  | "/$owner/$repo/sessions/$numId/$sandboxTab"
  | "/$owner/$repo/projects/$numId/sandbox/$sandboxTab"
  | "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab";

interface HiddenSandboxTabRedirectProps {
  activeTab: string;
  to: HiddenSandboxTabRedirectTo;
  params: { owner: string; repo: string; numId: string };
}

/** Bounces sandbox URLs for tabs this user does not see to Preview. */
export function HiddenSandboxTabRedirect({
  activeTab,
  to,
  params,
}: HiddenSandboxTabRedirectProps) {
  const flags = useQuery(api.auth.getExperimentalFlags);
  // Wait for the flags: an opted-in user's Files URL must not bounce on load.
  if (flags === undefined || !isHiddenSandboxTab(activeTab, flags)) {
    return null;
  }
  return (
    <Navigate
      to={to}
      params={{ ...params, sandboxTab: "preview" }}
      search={(prev) => prev}
      replace
    />
  );
}
