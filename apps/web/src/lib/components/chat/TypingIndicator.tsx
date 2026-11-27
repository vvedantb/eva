"use client";

import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import { tokenTransition, ListEnter } from "@vvedantb/ui";
import { AnimatePresence, m } from "motion/react";
import { typingLabelParts, type TypingUser } from "@eva/shared/typingPresence";

function typingLabel(users: TypingUser[]): ReactNode {
  return typingLabelParts(users).map((part) =>
    "name" in part ? (
      <span key={`name:${part.name}`} data-pii>
        {part.name}
      </span>
    ) : (
      <span key={`text:${part.text}`}>{part.text}</span>
    ),
  );
}

function TypingAvatar({ firstName }: { firstName: string }) {
  return (
    <span className="flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-[9px] font-medium text-primary-foreground">
      {firstName.charAt(0).toUpperCase()}
    </span>
  );
}

/** Three bouncing dots: someone (a teammate, or Eva in a thread) is writing. */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

/** The coordinator's live turn in its bubble: "Eva is typing" and the dots. */
export function EvaTypingLine() {
  return (
    <span
      aria-live="polite"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      Eva is typing
      <TypingDots />
    </span>
  );
}

/**
 * Shows which teammates are typing in the current conversation: a stack of
 * initial avatars, a name label, and an animated dot pulse. Renders nothing
 * when nobody is typing, so a parent can position it absolutely (e.g.
 * `bottom-full`) without reserving layout space.
 *
 * Avatars are initial circles (matching DocPresenceFacepile) rather than the
 * richer facehash avatar: presence returns a plain string userId that cannot
 * be typed as Id<"users">, and the broadcast firstName is enough here.
 */
export function TypingIndicator({
  users,
  className,
}: {
  users: TypingUser[];
  className?: string;
}) {
  return (
    <AnimatePresence>
      {users.length === 0 ? null : (
        <m.div
          key="typing"
          aria-live="polite"
          className={cn(
            "pointer-events-none flex items-center gap-2 text-xs text-muted-foreground",
            className,
          )}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={tokenTransition.fast}
        >
          <span className="flex -space-x-1.5">
            {users.slice(0, 3).map((user, index) => (
              <ListEnter
                key={user.userId}
                index={index}
                fast
                className="inline-flex"
              >
                <TypingAvatar firstName={user.firstName} />
              </ListEnter>
            ))}
          </span>
          <span className="truncate">{typingLabel(users)}</span>
          <TypingDots />
        </m.div>
      )}
    </AnimatePresence>
  );
}
