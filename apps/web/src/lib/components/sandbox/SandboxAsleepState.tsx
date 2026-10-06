import type { ComponentType } from "react";
import { Button } from "@eva/ui";
import { IconPlayerPlay } from "@tabler/icons-react";
import { WAKE_EVA_LABEL } from "@/lib/components/sandbox/SleepControlTooltip";

/** How a sandbox tab wakes Eva from its asleep state. */
export interface SandboxWake {
  onStartSandbox?: () => void;
  isSandboxStarting?: boolean;
}

/**
 * Empty state every sandbox tab shows while the sandbox is asleep: the tab's
 * icon, why it is empty, and the same "Wake up Eva" button on every tab.
 */
export function SandboxAsleepState({
  icon: Icon,
  label,
  wake,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  wake?: SandboxWake;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
      {Icon ? <Icon className="w-12 h-12 opacity-50" /> : null}
      <p className="text-sm">{label}</p>
      {wake?.onStartSandbox ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={wake.onStartSandbox}
          disabled={wake.isSandboxStarting}
        >
          <IconPlayerPlay size={14} />
          {wake.isSandboxStarting ? "Starting..." : WAKE_EVA_LABEL}
        </Button>
      ) : null}
    </div>
  );
}
