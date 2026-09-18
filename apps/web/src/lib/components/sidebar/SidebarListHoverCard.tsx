"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { compactRelativeTime } from "@eva/shared/dates";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@eva/ui";
import { IconGitBranch } from "@tabler/icons-react";

function authorDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
}): string {
  const fromParts = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (fromParts) return fromParts;
  if (user.fullName?.trim()) return user.fullName.trim();
  if (user.email?.trim()) return user.email.trim();
  return "Unknown";
}

/** Folder rows are tight â€” first name only (or first token of fullName / email). */
function authorFirstName(user: {
  firstName?: string | null;
  fullName?: string | null;
  email?: string | null;
}): string {
  const first = user.firstName?.trim();
  if (first) return first;
  const fromFull = user.fullName?.trim().split(/\s+/)[0];
  if (fromFull) return fromFull;
  const email = user.email?.trim();
  if (email) return email.split("@")[0] ?? email;
  return "Unknown";
}

/** Avatar + display name for sidebar hover footers (sessions, docs, automations). */
function HoverCardAuthor({ userId }: { userId: Id<"users"> }) {
  const user = useQuery(api.users.get, { id: userId });
  if (!user) {
    return (
      <UserInitials userId={userId} size="sm" hideLastSeen disableProfileCard />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserInitials
        userId={userId}
        user={user}
        size="sm"
        hideLastSeen
        disableProfileCard
      />
      <span data-pii className="truncate text-xs text-muted-foreground">
        {authorDisplayName(user)}
      </span>
    </div>
  );
}

/** Compact author for folder-layout session rows (smaller avatar + name). */
export function SessionFolderAuthor({ userId }: { userId: Id<"users"> }) {
  const user = useQuery(api.users.get, { id: userId });
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="origin-left shrink-0 scale-[0.75]">
        <UserInitials
          userId={userId}
          user={user ?? undefined}
          size="sm"
          hideLastSeen
          disableProfileCard
        />
      </div>
      {user ? (
        <span
          data-pii
          className="truncate text-[10px] leading-none text-muted-foreground"
        >
          {authorFirstName(user)}
        </span>
      ) : null}
    </div>
  );
}

interface SessionHoverCardBodyProps {
  title: string;
  /** When set, loads the first user-message preview from messages (SoT). */
  sessionId?: Id<"sessions">;
  /** Precomputed preview â€” prefer sessionId so list queries stay join-free. */
  preview?: string | null;
  createdAt: number;
  userId: Id<"users">;
  /** Branch chosen at session creation. Absent on sessions predating the field. */
  baseBranch?: string;
}

/**
 * Hover body for a session, shared by the vertical sidebar row and the
 * horizontal Chrome-style tab so both describe a session the same way.
 */
export function SessionHoverCardBody({
  title,
  sessionId,
  preview: previewProp,
  createdAt,
  userId,
  baseBranch,
}: SessionHoverCardBodyProps) {
  const fetchedPreview = useQuery(
    api.sessions.getFirstMessagePreview,
    sessionId ? { id: sessionId } : "skip",
  );
  const preview =
    sessionId !== undefined ? (fetchedPreview ?? null) : (previewProp ?? null);

  return (
    <>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {preview ? (
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
          {preview}
        </p>
      ) : null}
      {baseBranch ? (
        <div
          className="mt-3 flex min-w-0 items-center gap-1.5"
          title={`Base branch: ${baseBranch}`}
        >
          <IconGitBranch size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground">
            {baseBranch}
          </span>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <HoverCardAuthor userId={userId} />
        <span className="shrink-0 text-xs text-muted-foreground">
          {compactRelativeTime(createdAt)}
        </span>
      </div>
    </>
  );
}

interface SidebarListHoverCardProps {
  title: string;
  preview?: string | null;
  createdAt: number;
  /** Author when known (new docs / automations). Omitted for legacy docs. */
  userId?: Id<"users">;
  children: ReactNode;
}

/** Whole-row hover card: title, optional preview (3 lines), author + created time. */
export function SidebarListHoverCard({
  title,
  preview,
  createdAt,
  userId,
  children,
}: SidebarListHoverCardProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-64 p-3"
      >
        <p className="text-sm font-medium text-foreground">{title}</p>
        {preview ? (
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {preview}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          {userId ? <HoverCardAuthor userId={userId} /> : <span />}
          <span className="shrink-0 text-xs text-muted-foreground">
            {compactRelativeTime(createdAt)}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
