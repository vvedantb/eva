"use client";

import type { Id } from "@eva/backend";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  LoadingState,
  cn,
} from "@eva/ui";
import { IconGitPullRequest, IconX } from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import {
  SANDBOX_STATUS_STYLES,
  type SandboxStatus,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import { SessionHoverCardBody } from "@/lib/components/sidebar/SidebarListHoverCard";
import { TitleRegeneratingHint } from "@/lib/components/sidebar/SidebarSessionItem";
import {
  SessionMenuItems,
  useIsRegeneratingTitle,
} from "@/lib/components/sidebar/SessionMenuItems";
import type { TabGroupColor } from "@/lib/components/sidebar/session-tabs/tabGroupColors";

/**
 * Width a tab asks for before the strip starts squeezing, in rem. The tab row
 * multiplies it by its tab count (see SessionChromeTabGroup) so every tab in the
 * strip shrinks from the same preferred size and ends up the same width.
 */
export const TAB_PREFERRED_WIDTH_REM = 14;

interface ChromeTabSession {
  _id: Id<"sessions">;
  _creationTime: number;
  numId?: number;
  title: string;
  titleRegeneration?: { startedAt: number };
  status: SandboxStatus;
  isExecuting?: boolean;
  userId: Id<"users">;
  branchName?: string;
  baseBranch?: string;
  prUrl?: string;
  prState?: "draft" | "open" | "merged" | "closed";
}

export interface SessionChromeTabProps {
  session: ChromeTabSession;
  href: string;
  isSelected: boolean;
  /** Chrome draws a hairline only between two adjacent unselected tabs. */
  showSeparator: boolean;
  /** Group accent, used for the selected tab's stroke and flared shoulders. */
  groupColor: TabGroupColor;
  onRenameRequest: () => void;
  onArchiveRequest: () => void;
  /** Dismisses the tab locally — the session keeps running. */
  onClose: () => void;
  onDuplicate: () => Promise<string>;
  onDuplicateNavigate: (pathSegment: string) => void;
}

function prStateIconColor(
  state: "draft" | "open" | "merged" | "closed" | undefined,
): string {
  switch (state) {
    case "open":
      return "text-success";
    case "merged":
      return "text-status-code-review";
    case "closed":
      return "text-destructive";
    case "draft":
    default:
      return "text-muted-foreground";
  }
}

/**
 * One Chrome-style session tab.
 *
 * Anatomy copied from Chrome. Unselected tabs are chromeless and butt up
 * against each other with a hairline separator between them. The selected tab is
 * the only filled surface: it is painted in the page's own colour, flares out at
 * the bottom corners and covers the strip's divider, so it reads as the top edge
 * of the content below rather than a card floating on the strip.
 *
 * Width is never scrolled — tabs share the strip and shrink as more open, down
 * to the sandbox status dot. Each tab is its own container query so it can shed
 * detail as it narrows (PR icon, then close, then the title). The app logo lives
 * on the group pill, not the tab.
 */
export function SessionChromeTab({
  session,
  href,
  isSelected,
  showSeparator,
  groupColor,
  onRenameRequest,
  onArchiveRequest,
  onClose,
  onDuplicate,
  onDuplicateNavigate,
}: SessionChromeTabProps) {
  const statusStyle = SANDBOX_STATUS_STYLES[session.status];
  const isRegeneratingTitle = useIsRegeneratingTitle(session);

  // Longer open delay than the house default on purpose: tabs sit shoulder to
  // shoulder, so the pointer crosses several on its way to the one it wants.
  return (
    <HoverCard openDelay={400}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <HoverCardTrigger asChild>
            <div
              className={cn(
                // Width is owned by the motion wrapper in SessionChromeTabGroup
                // (`flexBasis` + `layout`) so add/close can animate the chip
                // without resizing the whole strip. min-w-8 is the squeezed floor.
                "group relative flex h-9 w-full min-w-8 items-center rounded-t-[0.625rem] transition-colors @container",
                isSelected
                  ? // Chrome stroke: left/top/right in the group accent — bottom
                    // stays open so the tab merges into the page; the sides meet
                    // the group's underline.
                    cn(
                      "z-10 border-2 border-b-0 bg-background text-foreground",
                      groupColor.border,
                    )
                  : "text-muted-foreground hover:bg-foreground/6 hover:text-foreground",
              )}
              // Middle-click closes the tab, as in every browser. The
              // matching mouse-down is swallowed because button 1 otherwise
              // starts the platform's autoscroll, which leaves a scroll cursor
              // stuck on the page after the tab has gone.
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => {
                if (e.button !== 1) return;
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
            >
              {showSeparator ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-border transition-opacity group-hover:opacity-0"
                />
              ) : null}
              {isSelected ? (
                // Chrome's flared shoulders: a quarter disc either side of the
                // tab, sweeping away from it and into the strip. Each shoulder
                // is one radial gradient — transparent inside the arc so the
                // strip shows through, then the group accent for 2px so the
                // tab's side stroke carries on around the curve, then the page
                // fill. Offset 10px (8px disc + the tab's 2px border) so the
                // arc starts exactly where the tab's border box ends.
                //
                // The shoulder is 10px wide, not 8: the extra 2px reach back
                // over the tab's own side border, painting the bottom 8px of it
                // in page fill. Without that the border would run straight down
                // to the baseline and stop square, and the curve would read as
                // a hook beside it instead of the outline turning outwards.
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -left-2.5 bottom-0 h-2 w-2.5 bg-[radial-gradient(circle_at_top_left,transparent_7.5px,currentColor_8px,currentColor_10px,rgb(var(--background))_10.5px)]",
                      groupColor.accent,
                    )}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -right-2.5 bottom-0 h-2 w-2.5 bg-[radial-gradient(circle_at_top_right,transparent_7.5px,currentColor_8px,currentColor_10px,rgb(var(--background))_10.5px)]",
                      groupColor.accent,
                    )}
                  />
                </>
              ) : null}
              {/* Press lives on the tab *body*, not the shell: the shell
                  carries the chrome stroke and the two radial-gradient corner
                  folds as absolutely-positioned children, and scaling it would
                  drag those off the tab's edge. Scaling the label region instead
                  reads as the content answering inside a fixed frame. 0.98 is
                  the figure `TabsTrigger` already uses. */}
              <DynamicLink
                to={href}
                className="motion-press flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 pr-1 text-[0.8125rem] active:scale-[0.98] [@container(max-width:4.5rem)]:justify-center [@container(max-width:4.5rem)]:px-0"
              >
                {/* Favicon slot: Drive grid while a turn is in flight; else
                    sandbox status. Stays visible when the tab is fully squeezed. */}
                {session.isExecuting === true ? (
                  <span className="flex shrink-0 items-center" title="Working">
                    <LoadingState
                      label="Working"
                      variant="Drive"
                      size="sm"
                      iconOnly
                    />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      statusStyle.dot,
                    )}
                    title={statusStyle.label}
                  />
                )}
                <span className="min-w-0 flex-1 truncate font-medium [@container(max-width:4.5rem)]:hidden">
                  {session.title}
                </span>
                <TitleRegeneratingHint
                  show={isRegeneratingTitle}
                  className="[@container(max-width:11rem)]:hidden"
                />
                {session.prUrl ? (
                  <IconGitPullRequest
                    size={14}
                    className={cn(
                      "shrink-0 [@container(max-width:11rem)]:hidden",
                      prStateIconColor(session.prState),
                    )}
                  />
                ) : null}
              </DynamicLink>
              <button
                type="button"
                aria-label={`Close ${session.title}`}
                title="Close tab"
                className={cn(
                  // `motion-press` rather than the hand-rolled
                  // `transition-[color,background-color,opacity]`: closing is
                  // a one-click action on a 24px target, so the press is the
                  // only acknowledgement it gets before the tab leaves the
                  // strip. The utility already covers colour, and opacity is in
                  // its property list too, so the reveal still fades.
                  "max-sm:hit-target motion-press mr-2 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:scale-[0.92] focus-visible:opacity-100 [@container(max-width:7.5rem)]:hidden",
                  isSelected
                    ? "opacity-100"
                    : // `reveal-on-hover` rather than a hand-rolled
                      // `sm:opacity-0 group-hover:opacity-100`: `group-hover:`
                      // compiles with `@media (hover: hover)` but `sm:opacity-0`
                      // does not, so the pair leaves the archive control
                      // permanently invisible on a landscape tablet.
                      "reveal-on-hover",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
              >
                <IconX size={14} />
              </button>
            </div>
          </HoverCardTrigger>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={(e) => e.stopPropagation()}>
          <SessionMenuItems
            session={session}
            href={href}
            isRegeneratingTitle={isRegeneratingTitle}
            onRenameRequest={onRenameRequest}
            onDuplicate={onDuplicate}
            onDuplicateNavigate={onDuplicateNavigate}
            onArchiveRequest={onArchiveRequest}
          />
        </ContextMenuContent>
      </ContextMenu>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-64 p-3"
      >
        <SessionHoverCardBody
          title={session.title}
          sessionId={session._id}
          createdAt={session._creationTime}
          userId={session.userId}
          baseBranch={session.baseBranch}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
