import { EmptyState } from "@vvedantb/ui";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { IconPlayerPlay } from "@tabler/icons-react";
import { OpenNavigationButton } from "@/lib/components/sidebar/OpenNavigationButton";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

export const Route = createFileRoute("/_global/automations")({
  staticData: { title: "Automations" },
  component: AutomationsGlobalPage,
});

/** Landing for the rail Automations entry — pick an automation from the sidebar. */
function AutomationsGlobalPage() {
  const simpleView = useSimpleView();
  if (simpleView) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
      <EmptyState.Root>
        <EmptyState.Icon icon={IconPlayerPlay} size={28} />
        <EmptyState.Title>Select an automation</EmptyState.Title>
        <EmptyState.Description>
          Choose one from the sidebar, or use + on an app to create one.
        </EmptyState.Description>
        <EmptyState.Actions>
          {<OpenNavigationButton label="Browse automations" className="mt-6" />}
        </EmptyState.Actions>
      </EmptyState.Root>
    </div>
  );
}
