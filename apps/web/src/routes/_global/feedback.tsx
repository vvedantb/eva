import { createFileRoute } from "@tanstack/react-router";
import { FeedbackClient } from "./feedback/FeedbackClient";

export const Route = createFileRoute("/_global/feedback")({
  staticData: { title: "Feedback" },
  component: FeedbackClient,
});
