import { LoadingState, Tabs, TabsList, TabsTrigger } from "@eva/ui";
import { SANDBOX_STATUS_STYLES } from "./sandboxStatusStyles";

/**
 * Which half of an entity a surface-owning page is showing: its own detail view
 * (`main`) or the sandbox workspace. Quick tasks and projects both route on this.
 */
export type SandboxSurface = "main" | "sandbox";

function isSandboxSurface(value: string): value is SandboxSurface {
  return value === "main" || value === "sandbox";
}

/**
 * Segmented control that swaps a detail surface for its sandbox, replacing the
 * old "View Sandbox" toggle button. Shared by the quick-task footer and the
 * project header so the pair reads as two peers rather than one action, and so
 * the sandbox's live status keeps a single dot vocabulary.
 */
export function SandboxSurfaceTabs({
  mainLabel,
  surface,
  isSandboxActive,
  isSandboxStarting,
  isSandboxStopping,
  isAgentActive = false,
  onSurfaceChange,
}: {
  /** Label for the non-sandbox half, e.g. "Task" or "Project". */
  mainLabel: string;
  surface: SandboxSurface;
  isSandboxActive: boolean;
  isSandboxStarting: boolean;
  isSandboxStopping: boolean;
  /** A turn is in flight — the pixel grid stands in for the status dot. */
  isAgentActive?: boolean;
  onSurfaceChange: (surface: SandboxSurface) => void;
}) {
  // `stopping` outranks `starting` outranks `active`: a stale `isSandboxActive`
  // can still read true while the sandbox is on its way up or down.
  const status = isSandboxStopping
    ? "stopping"
    : isSandboxStarting && !isSandboxActive
      ? "starting"
      : isSandboxActive
        ? "active"
        : null;

  return (
    <Tabs
      value={surface}
      onValueChange={(value) => {
        if (isSandboxSurface(value)) onSurfaceChange(value);
      }}
    >
      <TabsList
        size="sm"
        className="tabs-segmented"
        aria-label={`${mainLabel} or sandbox`}
      >
        <TabsTrigger value="main">{mainLabel}</TabsTrigger>
        <TabsTrigger value="sandbox" className="gap-1.5">
          Sandbox
          {/* Same swap the session rows make: a turn in flight already implies
              an active sandbox, so the grid stands in for the dot. */}
          {isAgentActive ? (
            <span className="flex shrink-0 items-center" title="Working">
              <LoadingState
                label="Working"
                variant="Drive"
                size="sm"
                iconOnly
              />
            </span>
          ) : status ? (
            <span
              className={`size-2 shrink-0 rounded-full ${SANDBOX_STATUS_STYLES[status].dot}`}
              title={SANDBOX_STATUS_STYLES[status].label}
              aria-label={SANDBOX_STATUS_STYLES[status].label}
            />
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
