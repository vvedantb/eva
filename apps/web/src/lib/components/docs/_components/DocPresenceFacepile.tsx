"use client";

import usePresence from "@convex-dev/presence/react";
import { api } from "@eva/backend";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { Id } from "@eva/backend";
import { cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";

export function DocPresenceFacepile({ docId }: { docId: Id<"docs"> }) {
  const currentUserId = useQuery(api.auth.me);
  const presenceStates = usePresence(
    api.presence,
    `doc:${docId}`,
    currentUserId ?? "",
  );

  if (!currentUserId) return null;

  const others = (presenceStates ?? []).filter(
    (p) => p.userId !== currentUserId && p.online,
  );

  return (
    <div className="flex min-w-6 items-center justify-end">
      <AnimatePresence>
        {others.length === 0 ? null : (
          <m.div
            key="facepile"
            className="flex items-center -space-x-1.5"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={motionFast}
          >
            {others.slice(0, 5).map((p) => (
              <UserAvatar key={p.userId} name={p.name} />
            ))}
            {others.length > 5 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                +{others.length - 5}
              </span>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserAvatar({ name }: { name?: string }) {
  const displayName = name ?? "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      title={displayName}
      className={cn(
        "flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-[10px] font-medium text-primary-foreground",
      )}
    >
      {initial}
    </div>
  );
}
