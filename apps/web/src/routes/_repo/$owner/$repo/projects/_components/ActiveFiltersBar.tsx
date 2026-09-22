import { IconX } from "@tabler/icons-react";
import { motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";

interface ActiveFiltersBarProps {
  filters: Array<{ key: string; label: string }>;
  onClearFilter: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFiltersBar({
  filters,
  onClearFilter,
  onClearAll,
}: ActiveFiltersBarProps) {
  return (
    <AnimatePresence>
      <m.div
        key="active-filters"
        className="flex items-center gap-1.5 flex-wrap pb-2 max-sm:gap-2.5"
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
          aria-label={`Clear filter: ${f.label}`}
          onClick={() => onClearFilter(f.key)}
          className="max-sm:hit-target group flex items-center gap-1 rounded-md bg-muted/60 px-2 max-sm:py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          {f.label}
          <IconX
            size={12}
            aria-hidden
            className="opacity-50 group-hover:opacity-100 transition-opacity"
          />
        </button>
      ))}
      {filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="max-sm:hit-target text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
        >
          Clear all
        </button>
      )}
      </m.div>
    </AnimatePresence>
  );
}
