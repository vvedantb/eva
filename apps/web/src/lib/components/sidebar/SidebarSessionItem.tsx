"use client";

import { DynamicLink } from "@/lib/components/DynamicLink";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import type { Id } from "@eva/backend";
import {
  cn,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  LoadingState,
} from "@eva/ui";
import { IconGitPullRequest, IconSparkles } from "@tabler/icons-react";
import {
  SANDBOX_STATUS_STYLES,
  type SandboxStatus,
} from "@/lib/components/sandbox/sandboxStatusStyles";
import {
  SessionFolderAuthor,
  SessionHoverCardBody,
} from "@/lib/components/sidebar/SidebarListHoverCard";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import { useSessionsSidebarSettings } from "@/lib/components/sidebar/useSessionsSidebarSettings";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

function prStateLabel(
  state: "draft" | "open" | "merged" | "closed" | undefined,
): string {
  switch (state) {
    case "open":
      return "Open";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    case "draft":
      return "Draft";
    default:
      return "PR";
  }
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

interface SidebarSessionItemProps {
  href: string;
  title: string;
  /** "Regenerate title" is running — a muted hint sits beside the title. */
  isRegeneratingTitle?: boolean;
  sessionId: Id<"sessions">;
  userId: Id<"users">;
  createdAt: number;
  updatedAt?: number;
  status: SandboxStatus;
  /** When true, Drive grid replaces the sandbox status dot (agent turn in flight). */
  isExecuting?: boolean;
  /** The user's persistent orchestrator session — marked instead of dotted. */
  isOrchestrator?: boolean;
  isSelected: boolean;
  onNavigate?: () => void;
  prUrl?: string;
  prState?: "draft" | "open" | "merged" | "closed";
  /** Branch chosen at session creation, shown in the hover card. */
  baseBranch?: string;
}

function SessionPrIcon({
  prUrl,
  prState,
}: {
  prUrl?: string;
  prState?: "draft" | "open" | "merged" | "closed";
}) {
  const simpleView = useSimpleView();
  if (simpleView || !prUrl) return null;
  return (
    <IconGitPullRequest
      size={12}
      className={cn("shrink-0", prStateIconColor(prState))}
      title={`PR: ${prStateLabel(prState)}`}
    />
  );
}

/**
 * Leading mark: Drive pixel grid while the assistant turn is in flight
 * (replaces sandbox status â€” awaiting a reply already implies sandbox active).
 * Otherwise the sandbox status color dot.
 */
function SessionStatusLeading({
  label,
  dotClassName,
  isExecuting,
  isOrchestrator,
}: {
  label: string;
  dotClassName: string;
  isExecuting: boolean;
  isOrchestrator: boolean;
}) {
  if (isExecuting) {
    return (
      <span className="flex shrink-0 items-center" title="Working">
        <LoadingState label="Working" variant="Drive" size="sm" iconOnly />
      </span>
    );
  }
  // Manager Ave is one persistent session per user rather than a piece of
  // work, so it is marked instead of dotted: its sandbox status is not what the
  // reader needs to tell it apart from the sessions around it.
  if (isOrchestrator) {
    return (
      <span className="flex shrink-0 items-center" title="Manager Ave">
        <IconSparkles size={12} className="shrink-0 text-sidebar-primary" />
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center" title={label}>
      <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} />
    </span>
  );
}

/** Muted "Regenerating…" beside the title while a new one is being written. */
export function TitleRegeneratingHint({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <span
      className={cn("shrink-0 text-[11px] text-muted-foreground", className)}
    >
      Regenerating…
    </span>
  );
}

export function SidebarSessionItem({
  href,
  title,
  isRegeneratingTitle = false,
  sessionId,
  userId,
  createdAt,
  updatedAt,
  status,
  isExecuting = false,
  isOrchestrator = false,
  isSelected,
  onNavigate,
  prUrl,
  prState,
  baseBranch,
}: SidebarSessionItemProps) {
  const { settings } = useSessionsSidebarSettings();
  const isFolder = settings.layout === "folder";
  const statusStyle = SANDBOX_STATUS_STYLES[status];
  const activityAt = updatedAt ?? createdAt;

  const titleClass = cn(
    "min-w-0 flex-1 transition-colors duration-[var(--motion-base)]",
    isSelected
      ? "font-medium text-sidebar-primary"
      : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
  );

  const statusLeading = (
    <SessionStatusLeading
      label={statusStyle.label}
      dotClassName={statusStyle.dot}
      isExecuting={isExecuting}
      isOrchestrator={isOrchestrator}
    />
  );

  const link = (
    <DynamicLink
      to={href}
      onClick={onNavigate}
      className="block rounded-menu-item px-4 py-1.5 text-[13px] leading-[18px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
    >
      {isFolder ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {statusLeading}
            <MarqueeOnHover className={titleClass}>{title}</MarqueeOnHover>
            <TitleRegeneratingHint show={isRegeneratingTitle} />
          </div>
          <div className="flex min-w-0 items-center gap-2 pl-4 opacity-60">
            <div className="min-w-0 flex-1">
              <SessionFolderAuthor userId={userId} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <SessionPrIcon prUrl={prUrl} prState={prState} />
              <RelativeDateTime
                at={activityAt}
                className="shrink-0 text-[11px] text-muted-foreground"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          {statusLeading}
          <MarqueeOnHover className={titleClass}>{title}</MarqueeOnHover>
          <TitleRegeneratingHint show={isRegeneratingTitle} />
          <SessionPrIcon prUrl={prUrl} prState={prState} />
          <RelativeDateTime
            at={activityAt}
            className="shrink-0 text-[11px] text-muted-foreground"
          />
        </div>
      )}
    </DynamicLink>
  );

  if (isFolder) return link;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{link}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-64 p-3"
      >
        <SessionHoverCardBody
          title={title}
          sessionId={sessionId}
          createdAt={createdAt}
          userId={userId}
          baseBranch={baseBranch}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
