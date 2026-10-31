import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LANDING_PREVIEWS } from "@/routes/_components/landing/previews";
import type { LandingPreviewKey } from "@/routes/_components/landing/landingContent";

const DEMO_KEYS = [
  "documents",
  "projects",
  "drafts",
  "sessions",
  "quickTasks",
  "agents",
  "reviews",
  "arena",
  "automations",
  "snapshots",
  "skills",
  "stats",
  "inbox",
  "teams",
] as const satisfies readonly LandingPreviewKey[];

const searchSchema = z.object({
  demo: z.enum(DEMO_KEYS).catch("sessions"),
  /** Container width in px: 666 is the showcase column at the widest page. */
  width: z.coerce.number().int().min(280).max(1200).catch(666),
});

/**
 * One landing demo on its own, at the width it is shown, for filming with the
 * Stageshow scripts (`film.mjs --select '.landing-demo'`) and for capturing
 * launch-post footage.
 */
export const Route = createFileRoute("/dev/landing-demos")({
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: LandingDemosPage,
});

function LandingDemosPage() {
  const { demo, width } = Route.useSearch();
  const { Demo } = LANDING_PREVIEWS[demo];
  return (
    <div className="min-h-dvh bg-background p-10">
      <div className="landing-demo" style={{ width }}>
        <Demo key={`${demo}-${width}`} />
      </div>
    </div>
  );
}
