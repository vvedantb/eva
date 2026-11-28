import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LandingPage } from "./_components/LandingPage";

const searchSchema = z.object({
  agent: z
    .union([z.boolean(), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === true ? true : undefined)),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
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
