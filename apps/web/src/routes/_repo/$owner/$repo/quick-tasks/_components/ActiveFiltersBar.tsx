import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";

interface ActiveFiltersBarProps {
  filters: Array<{ key: string; label: ReactNode }>;
  onClearFilter: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFiltersBar({
  filters,
  onClearFilter,
  onClearAll,
}: ActiveFiltersBarProps) {
  return (
    // Chips are 20px tall on a pointer device, which is not a tap target. They
    // grow to the 40px floor below `sm` rather than taking `hit-target`:
    // a chip's neighbour is 6px away, so the 8px ::after bleed on each of them
    // would overlap and one chip would clear the other's filter.
    <AnimatePresence>
      <m.div
        key="active-filters"
        className="max-sm:flex flex-wrap max-sm:items-center gap-1.5 pb-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={motionFast}
      >
      <span className="text-xs text-muted-foreground mr-0.5">Filtered by</span>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onClearFilter(f.key)}
          className="group max-sm:flex max-sm:min-h-10 max-sm:max-w-full max-sm:items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <span className="sr-only">Remove filter</span>
          <span className="max-sm:truncate">{f.label}</span>
          <IconX
            size={12}
            aria-hidden="true"
            className="max-sm:shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
          />
        </button>
      ))}
      {filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-1 max-sm:flex max-sm:min-h-10 max-sm:items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      )}
      </m.div>
    </AnimatePresence>
  );
}
