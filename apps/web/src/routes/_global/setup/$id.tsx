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
  // Opt-in, not opt-out: the GitHub App callback links here with no `auto`, and
  // silently adding every repository it can see is not a decision to make on
  // the user's behalf. Without the flag they get the list and choose.
  return <RepoSetupClient installationId={id} autoSync={auto === "true"} />;
}
