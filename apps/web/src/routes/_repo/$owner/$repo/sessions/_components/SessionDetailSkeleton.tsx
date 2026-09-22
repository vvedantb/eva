import { Skeleton } from "@eva/ui";

/** Alternating widths read as a conversation rather than a stack of bars. */
const MESSAGE_WIDTHS = ["w-4/5", "w-3/5 self-end", "w-2/3"];

/**
 * Stands in for the session chat while `sessions.get` resolves.
 *
 * Shaped like the panel it precedes — header, transcript, composer — because a
 * centred spinner gave no clue which of the three was slow and moved everything
 * on screen the instant data landed. Modelled on `QuickTaskDetailSkeleton`.
 */
export function SessionDetailSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col gap-4 p-3"
      aria-busy="true"
      aria-label="Loading session"
    >
      <div className="flex h-10 shrink-0 items-center gap-2">
        <Skeleton className="h-5 w-48" />
        <div className="ml-auto flex items-center gap-1.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {MESSAGE_WIDTHS.map((width) => (
          <div key={width} className={`flex flex-col gap-2 ${width}`}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16" />
          </div>
        ))}
      </div>

      <Skeleton className="h-12 shrink-0 rounded-full" />
    </div>
  );
}
