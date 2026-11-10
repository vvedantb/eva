import { createFileRoute } from "@tanstack/react-router";
import { ProjectsClient } from "./ProjectsClient";

export const Route = createFileRoute("/_repo/$owner/$repo/projects/")({
  staticData: { title: "Projects" },
  component: ProjectsClient,
});
