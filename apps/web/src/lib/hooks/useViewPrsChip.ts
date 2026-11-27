"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/** Convex opt-in for the composer's "View PRs" chip (false while flags load). */
export function useViewPrsChip(): boolean {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.viewPrsChip === true;
}
