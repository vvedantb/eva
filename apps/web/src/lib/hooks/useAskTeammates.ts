"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/** Convex opt-in for routing agent questions to teammates (false while loading). */
export function useAskTeammates(): boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.askTeammates === true;
}
