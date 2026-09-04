import { createFileRoute } from "@tanstack/react-router";
import { IconGitPullRequest } from "@tabler/icons-react";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { OpenNavigationButton } from "@/lib/components/sidebar/OpenNavigationButton";

export const Route = createFileRoute("/_repo/$owner/$repo/reviews/")({
  staticData: { title: "Reviews" },
  component: ReviewsIndexPage,
});

function ReviewsIndexPage() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        icon={
          <IconGitPullRequest size={24} className="text-muted-foreground" />
        }
        title="Select a pull request to review"
        action={
          <OpenNavigationButton label="Browse pull requests" className="mt-6" />
        }
      />
    </div>
  );
}
