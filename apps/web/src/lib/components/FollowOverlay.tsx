"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import { IconX } from "@tabler/icons-react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Button } from "@eva/ui";
import { useFollow } from "@/lib/contexts/FollowContext";
import { isInternalAppHref } from "@/lib/embed/embedded";

export function FollowOverlay() {
  const { following, stopFollowing } = useFollow();

  if (!following) return null;

  return (
    <FollowOverlayInner
      userId={following.userId}
      name={following.name}
      stopFollowing={stopFollowing}
    />
  );
}

function FollowOverlayInner({
  userId,
  name,
  stopFollowing,
}: {
  userId: Id<"users">;
  name: string;
  stopFollowing: () => void;
}) {
  const navigate = useNavigate();
  const userData = useQuery(api.users.get, { id: userId });
  const lastPathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!userData) return;

    if (!userData.lastSeenAt) {
      stopFollowing();
      return;
    }

    const TWO_MINUTES = 2 * 60 * 1000;
    if (Date.now() - userData.lastSeenAt > TWO_MINUTES) {
      stopFollowing();
      return;
    }
  }, [userData, stopFollowing]);

  const lastSeenPath = userData?.lastSeenPath;

  useEffect(() => {
    if (!lastSeenPath || !isInternalAppHref(lastSeenPath)) return;

    if (lastPathRef.current === undefined) {
      lastPathRef.current = lastSeenPath;
      if (window.location.pathname !== lastSeenPath) {
        navigate({ to: lastSeenPath });
      }
      return;
    }

    if (lastSeenPath !== lastPathRef.current) {
      lastPathRef.current = lastSeenPath;
      navigate({ to: lastSeenPath });
    }
  }, [lastSeenPath, navigate]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stopFollowing();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stopFollowing]);

  return (
    <>
      <div className="fixed inset-0 z-50 cursor-not-allowed ring-[3px] ring-inset ring-primary/70" />

      <div className="fixed top-3 left-1/2 z-60 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground smooth-shadow-lg">
          <span>
            Following <span data-pii>{name}</span>
          </span>
          {/* Escape also stops following, but a phone has no Escape key and the
              overlay swallows every other tap — so this has to be reachable. */}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Stop following"
            className="max-sm:hit-target h-5 w-5 rounded-full text-primary-foreground/80 hover:bg-primary/80 hover:text-primary-foreground max-sm:size-7"
            onClick={stopFollowing}
          >
            <IconX size={14} />
          </Button>
        </div>
      </div>
    </>
  );
}
