"use client";

import { Link } from "@tanstack/react-router";
import { IconLockOff } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { EmptyState } from "@/lib/components/ui/EmptyState";

/**
 * Shown when `/$owner/$repo/…` resolves to no repo the viewer can read.
 *
 * This used to be a silent `navigate({ to: "/home" })`, which read as the app
 * ignoring the click: a shared link to a codebase you have not been added to
 * bounced you to a list with no explanation. The two causes — not connected,
 * no access — are indistinguishable from the client, so the copy names both.
 */
export function RepoNotFound({ owner, name }: { owner: string; name: string }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
      <EmptyState
        icon={<IconLockOff size={28} />}
        title={`Can't open ${owner}/${name}`}
        description="It isn't connected to Eva, or you don't have access. Ask a team owner to add you, or pick another codebase."
        action={
          <Button asChild size="sm" variant="outline" className="mt-5">
            <Link to="/home">Go to codebases</Link>
          </Button>
        }
      />
    </div>
  );
}
