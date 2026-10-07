import { z } from "zod";

/** Mirrors the backend's `sandboxIdlePauseModeValidator`. */
export type SandboxIdlePauseMode = "off" | "dry-run" | "on";

export const PREVIEW_WAKE_KINDS = ["session", "task", "project"] as const;
export type PreviewWakeKind = (typeof PREVIEW_WAKE_KINDS)[number];

export interface PreviewWakeParams {
  kind: PreviewWakeKind;
  /** Convex document id of the session, quick task or project. */
  id: string;
  port?: number;
  /** App route to land on, e.g. "/demo/referral-portal". */
  path?: string;
}

/** Search params accepted by the `/p/$kind/$id` wake route. */
export const previewWakeSearchSchema = z.object({
  port: z.coerce.number().int().positive().optional(),
  path: z.string().optional(),
});

/**
 * Stable, shareable path for an entity's preview. Keyed by entity rather than
 * sandbox id, so it survives pauses and even sandbox recreation. The route
 * wakes the sandbox if needed, waits for the dev server, then hands off to the
 * sandbox's own domain.
 */
export function previewWakePath(params: PreviewWakeParams): string {
  const search = new URLSearchParams();
  if (params.port !== undefined) search.set("port", String(params.port));
  const path = params.path?.trim();
  if (path && path !== "/") search.set("path", path);
  const query = search.toString();
  return `/p/${params.kind}/${encodeURIComponent(params.id)}${query ? `?${query}` : ""}`;
}
