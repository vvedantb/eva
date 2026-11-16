import { useQuery } from "convex/react";
import { api } from "@eva/backend";

/**
 * Replaces the whole signed-in app while the backend is in maintenance mode
 * (`MAINTENANCE` env var, see `convex/maintenance.ts`). Unmounting the app
 * stops every `auth*` query from throwing behind the screen; the status query
 * is live, so the app comes back on its own when maintenance ends.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  // `undefined` while loading: render the app rather than hold first paint.
  const inMaintenance = useQuery(api.maintenance.status);
  return inMaintenance === true ? <MaintenanceScreen /> : children;
}

export function MaintenanceScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="ui-surface w-full max-w-md p-6 text-center">
        <h1 className="text-balance text-lg font-semibold text-foreground">
          Eva is down for maintenance
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          We are updating Eva. This page comes back on its own when we are done.
        </p>
      </div>
    </div>
  );
}
