import { createFileRoute } from "@tanstack/react-router";
import { InboxClient } from "@/lib/components/inbox/InboxClient";
import { useRepo } from "@/lib/contexts/RepoContext";

export const Route = createFileRoute("/_repo/$owner/$repo/inbox")({
  staticData: { title: "Inbox" },
  component: RepoInbox,
});

/** A repo's inbox: Needs you lists that repo only; Updates stays the full feed. */
function RepoInbox() {
  const { repo } = useRepo();
  return <InboxClient repoId={repo._id} />;
}
