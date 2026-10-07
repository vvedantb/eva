import type { Ref } from "react";

/**
 * Discord-style marker where unseen replies start. Unlike `ChatDayDivider`,
 * the lines stay: they mark a thread boundary ("everything below is new"),
 * which a label alone does not read as. Label and lines use the theme
 * `primary` token, so the colour follows the user's accent. `ref` lets
 * `ChatBody` observe it for the "N new messages" pill.
 */
export function ChatNewDivider({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      role="separator"
      aria-label="New messages"
      className="flex items-center gap-3 py-1 select-none"
    >
      <span className="h-px flex-1 bg-primary/30" />
      <span className="text-2xs font-medium tracking-wide text-primary uppercase">
        New
      </span>
      <span className="h-px flex-1 bg-primary/30" />
    </div>
  );
}
