import { v } from "convex/values";
import { z } from "zod";

/**
 * Which server streams the sandbox desktop (Xvnc :1) to the Computer tab.
 *
 * - `novnc`: websockify + noVNC (RFB, JPEG tiles). Default.
 * - `voxl`: github.com/tembo/voxl (H.264 over WebSocket, WebCodecs decode).
 *   Ubuntu images only; the desktop falls back to noVNC where it cannot run.
 *
 * Chosen per deployment by the `DESKTOP_STREAMER` Convex env var, so trying or
 * dropping voxl needs no schema change or migration.
 */
const desktopStreamerSchema = z.enum(["novnc", "voxl"]);
export type DesktopStreamer = z.infer<typeof desktopStreamerSchema>;

export const desktopStreamerValidator = v.union(
  v.literal("novnc"),
  v.literal("voxl"),
);

/** The streamer `DESKTOP_STREAMER` asks for; unset or unknown → noVNC. */
export function configuredDesktopStreamer(): DesktopStreamer {
  const parsed = desktopStreamerSchema.safeParse(process.env.DESKTOP_STREAMER);
  return parsed.success ? parsed.data : "novnc";
}
