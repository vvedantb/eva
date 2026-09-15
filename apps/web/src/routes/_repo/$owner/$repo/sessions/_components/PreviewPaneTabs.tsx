import { IconWorld, IconX } from "@tabler/icons-react";
import { cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";

interface PreviewPaneTabsProps {
  previewIds: string[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

function paneLabel(index: number) {
  return index === 0 ? "Preview" : `Preview ${index + 1}`;
}

export function PreviewPaneTabs({
  previewIds,
  activeId,
  onSelect,
  onClose,
}: PreviewPaneTabsProps) {
  if (previewIds.length <= 1) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1 overflow-x-auto bg-muted/40 px-2 py-1.5 scrollbar-thin"
      role="tablist"
    >
      <AnimatePresence initial={false} mode="popLayout">
      {previewIds.map((id, index) => {
        const selected = id === activeId;
        return (
          <m.div
            key={id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
            className={cn(
              // The wrapper only shifts colour; the press lives on the button
              // inside it, so `transform` here named a property nothing sets.
              "group flex h-8 shrink-0 items-center rounded-lg motion-base",
              selected ? "bg-card" : "hover:bg-muted/80",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                // `motion-press` rather than a hand-listed
                // `transition-[transform,background-color]`: Tailwind compiles
                // `scale-[0.96]` to the individual `scale` property, which
                // `transform` never matched, so this tab press was inert.
                "motion-press flex h-full min-w-24 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium active:scale-[0.96]",
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onSelect(id)}
            >
              <IconWorld className="size-3.5 shrink-0" />
              {paneLabel(index)}
            </button>
            {index > 0 ? (
              <button
                type="button"
                className="hit-target motion-press mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100 active:scale-[0.96] group-hover:opacity-100"
                aria-label={`Close ${paneLabel(index)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(id);
                }}
              >
                <IconX className="size-3.5" />
              </button>
            ) : null}
          </m.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
