import { createFileRoute } from "@tanstack/react-router";
import { IconFileText } from "@tabler/icons-react";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { OpenNavigationButton } from "@/lib/components/sidebar/OpenNavigationButton";

export const Route = createFileRoute("/_repo/$owner/$repo/testing-arena/")({
  staticData: { title: "Testing Arena" },
  component: TestingArenaPage,
});

function TestingArenaPage() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        icon={<IconFileText size={24} className="text-muted-foreground" />}
        title="Select a document to test"
        action={
          <OpenNavigationButton label="Browse documents" className="mt-6" />
        }
      />
    </div>
  );
}
