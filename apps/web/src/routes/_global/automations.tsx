import { createFileRoute, Navigate } from "@tanstack/react-router";
import { IconPlayerPlay } from "@tabler/icons-react";
import { EmptyState } from "@/lib/components/ui/EmptyState";
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
      <EmptyState
        icon={<IconPlayerPlay size={28} />}
        title="Select an automation"
        description="Choose one from the sidebar, or use + on an app to create one."
        action={
          <OpenNavigationButton label="Browse automations" className="mt-6" />
        }
      />
    </div>
  );
}
