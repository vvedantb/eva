import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsClient } from "@/lib/components/connections/ConnectionsClient";

export const Route = createFileRoute("/_global/settings/connections")({
  staticData: { title: "Settings" },
  component: ConnectionsClient,
});
