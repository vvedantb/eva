import { createFileRoute } from "@tanstack/react-router";
import { RepoSetupClient } from "./RepoSetupClient";

interface SetupSearch {
  auto?: string;
}

export const Route = createFileRoute("/_global/setup/$id")({
  staticData: { title: "Setup" },
  component: RepoSetupPage,
  validateSearch: (search: Record<string, string>): SetupSearch => ({
    auto: search.auto,
  }),
});

function RepoSetupPage() {
  const { id } = Route.useParams();
  const { auto } = Route.useSearch();
  return <RepoSetupClient installationId={id} autoSync={auto === "true"} />;
}
