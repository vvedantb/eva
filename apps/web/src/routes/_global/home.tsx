import { createFileRoute } from "@tanstack/react-router";
import { ReposClient } from "./home/ReposClient";

export const Route = createFileRoute("/_global/home")({
  staticData: { title: "Codebases" },
  component: ReposClient,
});
