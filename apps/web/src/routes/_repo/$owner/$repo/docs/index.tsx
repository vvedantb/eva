import { EmptyState } from "@vvedantb/ui";
import { createFileRoute } from "@tanstack/react-router";
import { IconFileText } from "@tabler/icons-react";
import { OpenNavigationButton } from "@/lib/components/sidebar/OpenNavigationButton";

export const Route = createFileRoute("/_repo/$owner/$repo/docs/")({
  staticData: { title: "Documents" },
  component: DocsIndexPage,
});

function DocsIndexPage() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState.Root>
        <EmptyState.Icon icon={IconFileText} size={24} />
        <EmptyState.Title>Select a document to view</EmptyState.Title>
        <EmptyState.Actions>
          {<OpenNavigationButton label="Browse documents" className="mt-6" />}
        </EmptyState.Actions>
      </EmptyState.Root>
    </div>
  );
}
