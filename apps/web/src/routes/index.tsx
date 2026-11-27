import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LandingPage } from "./_components/LandingPage";

const searchSchema = z.object({
  // A bare `?agent` (no value) parses as "", so accept it alongside `?agent=true`.
  agent: z
    .union([z.boolean(), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === true ? true : undefined)),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  // A preload must not navigate the whole page, so the agent-login hand-off
  // only runs for a real visit.
  beforeLoad: ({ context, search, preload }) => {
    if (search.agent && !preload) {
      window.location.href = "/api/auth/agent-login";
    }
    if (context.isSignedIn) {
      throw redirect({ to: "/home" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { agent } = Route.useSearch();
  return <LandingPage agentRedirect={agent === true} />;
}
