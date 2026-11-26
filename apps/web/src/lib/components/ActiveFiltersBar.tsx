import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { Button, tokenTransition } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";

export interface ActiveFilterChip<K extends string> {
  key: K;
  /** May hold a person's name marked `data-pii`. */
  label: ReactNode;
}

/** The "Filtered by" chips above a list (quick tasks, projects): a click clears one filter. */
export function ActiveFiltersBar<K extends string>({
  filters,
  onClearFilter,
  onClearAll,
}: {
  filters: ReadonlyArray<ActiveFilterChip<K>>;
  onClearFilter: (key: K) => void;
  onClearAll: () => void;
}) {
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
        transition={tokenTransition.fast}
      >
        <span className="text-xs text-muted-foreground mr-0.5">
          Filtered by
        </span>
        {filters.map((f) => (
          <Button
            key={f.key}
            variant="ghost"
            size="sm"
            onClick={() => onClearFilter(f.key)}
            className="group max-sm:flex max-sm:min-h-10 max-sm:max-w-full max-sm:items-center gap-1 rounded-control bg-muted/60 px-2 py-0.5 h-auto font-normal text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            {/* The name reads "Remove filter <label>". Not an `aria-label`:
                that would copy a person's name out of its `data-pii` span. */}
            <span className="sr-only">Remove filter</span>
            <span className="max-sm:truncate">{f.label}</span>
            <IconX
              size={12}
              aria-hidden="true"
              className="max-sm:shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
            />
          </Button>
        ))}
        {filters.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="ml-1 h-auto px-1 py-0.5 font-normal max-sm:flex max-sm:min-h-10 max-sm:items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </Button>
        )}
      </m.div>
    </AnimatePresence>
  );
}
