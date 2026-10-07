"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/**
 * Convex opt-in for surfacing the Vercel deployment: the deployment status row
 * in the quick task properties panel and the View Preview dropdown item.
 * False while flags are loading, so the UI stays hidden by default.
 */
export function useViewVercelDeployment(): boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.viewVercelDeployment === true;
}
