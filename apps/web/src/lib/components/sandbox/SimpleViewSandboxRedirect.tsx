"use client";

import { Navigate } from "@tanstack/react-router";
import {
  isSimpleViewHiddenSandboxTab,
  useSimpleView,
} from "@/lib/hooks/useSimpleView";

type SimpleViewSandboxRedirectTo =
  | "/$owner/$repo/sessions/$numId/$sandboxTab"
  | "/projects/$owner/$repo/$numId/sandbox/$sandboxTab"
  | "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab";

interface SimpleViewSandboxRedirectProps {
  activeTab: string;
  to: SimpleViewSandboxRedirectTo;
  params: { owner: string; repo: string; numId: string };
}

/** Bounces sandbox URLs that simple view does not show to Preview. */
export function SimpleViewSandboxRedirect({
  activeTab,
  to,
  params,
}: SimpleViewSandboxRedirectProps) {
  const simpleView = useSimpleView();
  if (!simpleView || !isSimpleViewHiddenSandboxTab(activeTab)) return null;
  return (
    <Navigate
      to={to}
      params={{ ...params, sandboxTab: "preview" }}
      search={(prev) => prev}
      replace
    />
  );
}
