import { createFileRoute } from "@tanstack/react-router";
import { AveChat } from "@/lib/components/ave/AveChat";
import { AveMark } from "@/lib/components/ave/AveMark";

export const Route = createFileRoute("/_global/ave")({
  staticData: { title: "Manager Ave" },
  component: AveRoute,
});

/**
 * Manager Ave full screen, at a stable per-user URL. The floating launcher
 * (`AveLauncherProvider`) mounts the same chat as a popover; this is where its
 * expand button lands. `_global.tsx` clamps this route to the viewport, which
 * the chat's scroll container needs.
 */
function AveRoute() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <AveMark size={20} className="shrink-0" />
        <span className="flex-1 truncate text-sm font-semibold">
          Manager Ave
        </span>
      </div>
      <AveChat />
    </div>
  );
}
