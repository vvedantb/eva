"use client";

import type { PrOwnerRef } from "@eva/backend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { IconGitPullRequest } from "@tabler/icons-react";
import { PrActionsSubmenus } from "@/lib/components/pr-menu/PrActionsSubmenus";
import { useOwnerPullRequests } from "@/lib/components/pr-menu/useOwnerPullRequests";
import { useViewPrsChip } from "@/lib/hooks/useViewPrsChip";
import { COMPOSER_CHIP_CLASS } from "./composerChip";

/**
 * "View PRs" on the composer's chip row, behind the `viewPrsChip` flag. It
 * shows only when the chat's owner has pull requests, and opens the same PR
 * rows and actions as the chat's "…" menu (`PrActionsSubmenus`).
 */
export function ViewPrsChip({ owner }: { owner: PrOwnerRef }) {
  const enabled = useViewPrsChip();
  const prs = useOwnerPullRequests(enabled ? owner : undefined);
  if (prs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={COMPOSER_CHIP_CLASS}>
          <IconGitPullRequest className="size-3.5 shrink-0 text-muted-foreground" />
          {prs.length === 1 ? "View PR" : "View PRs"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <PrActionsSubmenus variant="dropdown" prs={prs} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
