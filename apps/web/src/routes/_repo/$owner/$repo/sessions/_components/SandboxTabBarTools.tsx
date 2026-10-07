import { IconLetterCase, IconPlus, IconTerminal2 } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import type { TerminalPanelApi } from "@/lib/components/sandbox/SandboxWorkspace";

const SANDBOX_RAIL_ICON_BUTTON_CLASS =
  "motion-press max-sm:hit-target flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40";

export function SandboxTabBarTools({
  onNewPreview,
  newPreviewDisabled,
  terminalPanel,
  showLabels,
  onToggleLabels,
}: {
  onNewPreview: () => void;
  newPreviewDisabled: boolean;
  terminalPanel: TerminalPanelApi;
  /** Desktop rail: tab labels under the icons. */
  showLabels: boolean;
  onToggleLabels: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 md:mt-auto md:flex-col">
      {/* Editor and Computer are first-class tabs on the rail, so `+` is now a
          direct New Preview action rather than a one-item menu. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="New preview"
            className={SANDBOX_RAIL_ICON_BUTTON_CLASS}
            onClick={onNewPreview}
            disabled={newPreviewDisabled}
          >
            <IconPlus className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          New preview
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Toggle terminal panel"
            aria-pressed={terminalPanel.expanded}
            className={SANDBOX_RAIL_ICON_BUTTON_CLASS}
            onClick={terminalPanel.toggle}
          >
            <IconTerminal2 className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          Toggle terminal panel
        </TooltipContent>
      </Tooltip>
      {/* Desktop only: the phone strip already spells its tabs out. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={showLabels ? "Hide tab labels" : "Show tab labels"}
            aria-pressed={showLabels}
            className={cn(SANDBOX_RAIL_ICON_BUTTON_CLASS, "max-md:hidden")}
            onClick={onToggleLabels}
          >
            <IconLetterCase className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {showLabels ? "Hide labels" : "Show labels"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
