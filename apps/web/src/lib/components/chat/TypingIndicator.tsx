"use client";

import type { ReactNode } from "react";
import { cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import type { TypingUser } from "@/lib/hooks/useTypingPresence";

function typingLabel(users: TypingUser[]): ReactNode {
  const names = users.map((user) => user.firstName);
  // Defaults guard against an empty array for the type checker; in practice the
  // indicator is only rendered with at least one user.
  const [first = "Someone", second = "Someone"] = names;
  if (names.length === 1)
    return (
      <>
        <span data-pii>{first}</span> is typing
      </>
    );
  if (names.length === 2)
    return (
      <>
        <span data-pii>{first}</span> and <span data-pii>{second}</span> are
        typing
      </>
    );
  return (
    <>
      <span data-pii>{first}</span> and {names.length - 1} others are typing
    </>
  );
}

function TypingAvatar({ firstName }: { firstName: string }) {
  return (
    <span className="flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-[9px] font-medium text-primary-foreground">
      {firstName.charAt(0).toUpperCase()}
    </span>
  );
}

function TypingDots() {
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
          transition={motionFast}
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
