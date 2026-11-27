import {
  LoadingState,
  Tabs,
  TabsList,
  TabsTrigger,
  UnreadDot,
} from "@vvedantb/ui";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  SANDBOX_STATUS_STYLES,
  showsSandboxStatusDot,
} from "./sandboxStatusStyles";

/**
 * Which half of an entity a surface-owning page is showing: its own detail view
 * (`main`) or the sandbox workspace. Quick tasks and projects both route on this.
 */
export const SANDBOX_SURFACES = ["main", "sandbox"] as const;
export type SandboxSurface = (typeof SANDBOX_SURFACES)[number];

function isSandboxSurface(value: string): value is SandboxSurface {
  return SANDBOX_SURFACES.some((surface) => surface === value);
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
  hasUnread = false,
  onSurfaceChange,
}: {  mainLabel: string;
  surface: SandboxSurface;
  isSandboxActive: boolean;
  isSandboxStarting: boolean;
  isSandboxStopping: boolean;  isAgentActive?: boolean;  hasUnread?: boolean;
  onSurfaceChange: (surface: SandboxSurface) => void;
}) {
  const simpleView = useSimpleView();  const liveStatus = isSandboxStopping
    ? "stopping"
    : isSandboxStarting && !isSandboxActive
      ? "starting"
      : isSandboxActive
        ? "active"
        : null;
  const status =
    liveStatus && showsSandboxStatusDot(liveStatus, simpleView)
      ? liveStatus
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
          Sandbox          {isAgentActive ? (
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
          <UnreadDot
            show={hasUnread && surface !== "sandbox" && !isAgentActive}
          />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
