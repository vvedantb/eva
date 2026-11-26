import { EmptyState } from "@vvedantb/ui";
import { createFileRoute } from "@tanstack/react-router";
import { IconGitPullRequest } from "@tabler/icons-react";
import { OpenNavigationButton } from "@/lib/components/sidebar/OpenNavigationButton";

export const Route = createFileRoute("/_repo/$owner/$repo/reviews/")({
  staticData: { title: "Reviews" },
  component: ReviewsIndexPage,
});

function ReviewsIndexPage() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState.Root>
        <EmptyState.Icon icon={IconGitPullRequest} size={24} />
        <EmptyState.Title>Select a pull request to review</EmptyState.Title>
        <EmptyState.Actions>
          {
            <OpenNavigationButton
              label="Browse pull requests"
              className="mt-6"
            />
          }
        </EmptyState.Actions>
      </EmptyState.Root>
    </div>
  );
}
