"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { ActivityLayout } from "@vvedantb/ui";

/**
 * Chat activity layout from the "Claude-style activity steps" opt-in. Folded
 * (Codex-style) while flags load, so the default never flashes the other way.
 */
export function useActivityLayout(): ActivityLayout {
  const flags = useQuery(api.auth.getExperimentalFlags);
  return flags?.claudeStyleActivity === true ? "inline" : "folded";
}
