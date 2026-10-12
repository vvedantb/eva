"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type SandboxOwner } from "@eva/backend";
import {
  DropdownMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  CircleSpinner,
} from "@eva/ui";
import { IconBrandVercel, IconGitPullRequest } from "@tabler/icons-react";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { useViewVercelDeployment } from "@/lib/hooks/useViewVercelDeployment";
import { prStateIconClass } from "./prStateIconClass";

interface PrLinkMenuItemsArgs {
  /** Offers Create PR when set; omit on surfaces without that action. */
  createPr?: { enabled: boolean; isCreating: boolean; onCreate: () => void };
  prUrl: string | undefined;
  /** Colours the View PR icon (sessions only); others leave it default. */
  prState?: "draft" | "open" | "merged" | "closed";
  /**
   * The chat whose PRs these are. When it holds more than one PR, View PR
   * becomes one item per PR, numbered, instead of a single link.
   */
  owner?: SandboxOwner;
  /**
   * True when a deployment exists — renders the disabled View Preview hint,
   * behind the `viewVercelDeployment` experimental flag.
   */
  hasDeployment: boolean;
}

/**
 * The Create PR / View PR(s) / View Preview block of the "More" dropdown, shared
 * by the quick-task footer and header, the session header and the project
 * header. Simple view hides git/PR plumbing here, so the three surfaces cannot
 * drift apart. Returning `hasItems` lets callers keep their own separator
 * logic around the block.
 */
export function usePrLinkMenuItems(args: PrLinkMenuItemsArgs): {
  hasItems: boolean;
  items: ReactNode;
} {
  const simpleView = useSimpleView();
  const viewVercelDeployment = useViewVercelDeployment();
  const ownerPrs = useQuery(
    api.pullRequests.listForOwner,
    args.owner !== undefined && !simpleView ? { owner: args.owner } : "skip",
  );
  const manyPrs = ownerPrs !== undefined && ownerPrs.length > 1;
  const showCreatePr = !simpleView && Boolean(args.createPr?.enabled);
  const showViewPr = !simpleView && (args.prUrl !== undefined || manyPrs);
  const showViewPreview =
    !simpleView && viewVercelDeployment && args.hasDeployment;
  const hasItems = showCreatePr || showViewPr || showViewPreview;
  const createPr = args.createPr;

  return {
    hasItems,
    items: (
      <>
        {showCreatePr && createPr ? (
          <DropdownMenuItem
            onClick={createPr.onCreate}
            disabled={createPr.isCreating}
          >
            {createPr.isCreating ? (
              <CircleSpinner size="sm" className="size-3.5" />
            ) : (
              <IconGitPullRequest size={14} />
            )}
            Create PR
          </DropdownMenuItem>
        ) : null}
        {showViewPr && manyPrs
          ? ownerPrs.map((pr) => (
              <DropdownMenuItem key={pr._id} asChild>
                <a href={pr.prUrl} target="_blank" rel="noopener noreferrer">
                  <IconGitPullRequest
                    size={14}
                    className={prStateIconClass(pr.state)}
                  />
                  View PR #{pr.prNumber}
                </a>
              </DropdownMenuItem>
            ))
          : null}
        {showViewPr && !manyPrs && args.prUrl !== undefined ? (
          <DropdownMenuItem asChild>
            <a href={args.prUrl} target="_blank" rel="noopener noreferrer">
              <IconGitPullRequest
                size={14}
                className={
                  args.prState === undefined
                    ? undefined
                    : prStateIconClass(args.prState)
                }
              />
              View PR
            </a>
          </DropdownMenuItem>
        ) : null}
        {showViewPreview ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DropdownMenuItem disabled>
                  <IconBrandVercel size={14} />
                  View Preview
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Please start sandbox and view changes through the preview tab
              there instead
            </TooltipContent>
          </Tooltip>
        ) : null}
      </>
    ),
  };
}
