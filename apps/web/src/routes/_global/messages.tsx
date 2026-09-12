import { createFileRoute } from "@tanstack/react-router";
import { MessagesClient } from "@/lib/components/messages/MessagesClient";

export const Route = createFileRoute("/_global/messages")({
  staticData: { title: "Messages" },
  component: MessagesClient,
});
