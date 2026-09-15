import { createFileRoute } from "@tanstack/react-router";
import { MessagesClient } from "@/lib/components/messages/MessagesClient";

export const Route = createFileRoute("/_repo/$owner/$repo/messages")({
  staticData: { title: "Messages" },
  component: MessagesClient,
});
