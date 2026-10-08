import { createFileRoute } from "@tanstack/react-router";
import { UsageClient } from "./UsageClient";

export const Route = createFileRoute("/_repo/$owner/$repo/settings/logs")({
  staticData: { title: "Settings" },
  component: UsageClient,
});
