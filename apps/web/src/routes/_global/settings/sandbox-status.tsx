import { createFileRoute } from "@tanstack/react-router";
import { SandboxStatusClient } from "@/lib/components/sandboxes/SandboxStatusClient";

export const Route = createFileRoute("/_global/settings/sandbox-status")({
  staticData: { title: "Settings" },
  component: SandboxStatusClient,
});
