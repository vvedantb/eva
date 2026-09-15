"use client";

import type { ReactNode } from "react";
import {
  DropdownMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import {
  IconBrandVercel,
  IconGitPullRequest,
  IconLoader2,
} from "@tabler/icons-react";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { prStateIconClass } from "./prStateIconClass";

interface PrLinkMenuItemsArgs {
  /** Offers Create PR when set; omit on surfaces without that action. */
  createPr?: { enabled: boolean; isCreating: boolean; onCreate: () => void };
  prUrl: string | undefined;
  /** Colours the View PR icon (sessions only); others leave it default. */
  prState?: "draft" | "open" | "merged" | "closed";
  /** True when a deployment exists — renders the disabled View Preview hint. */
  hasDeployment: boolean;
}

/**
 * The Create PR / View PR / View Preview block of the "More" dropdown, shared
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
  const showCreatePr = !simpleView && Boolean(args.createPr?.enabled);
  const showViewPr = !simpleView && args.prUrl !== undefined;
  const showViewPreview = !simpleView && args.hasDeployment;
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
              <IconLoader2 size={14} className="animate-spin" />
            ) : (
              <IconGitPullRequest size={14} />
            )}
            Create PR
          </DropdownMenuItem>
        ) : null}
        {showViewPr && args.prUrl !== undefined ? (
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
