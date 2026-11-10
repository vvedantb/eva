import { api, PERSONALISATION_PRESETS } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Facehash } from "facehash";
import type { ReactNode } from "react";
import { compactRelativeTime } from "../utils/dates";
import { getUserInitials, type UserFields } from "./getUserInitials";

const ONLINE_THRESHOLD_MS = 120_000;

/** Matches a Convex `users` table id well enough to gate the profile query. */
const USER_ID_PATTERN = /^[a-z0-9_]{16,40}$/;

function isUsersTableId(id: string): id is Id<"users"> {
  return USER_ID_PATTERN.test(id);
}

function getUserName(user: UserFields): string {
  return (
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.fullName ||
    ""
  );
}

export function UserInitials({
  userId,
  user: preloadedUser,
  hideLastSeen,
  size,
  disableProfileCard,
}: {
  userId?: Id<"users">;
  user?: UserFields;
  hideLastSeen?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * Render the bare avatar with no hover affordance. Used by
   * `UserProfileHoverCardBody` so the avatar it renders does not open another
   * profile card (which would recurse).
   */
  disableProfileCard?: boolean;
}) {
  const fetchedUser = useQuery(
    api.users.get,
    !preloadedUser && userId ? { id: userId } : "skip",
  );
  const user = preloadedUser ?? fetchedUser;
  if (!user) return null;

  const initials = getUserInitials(user);
  const name = getUserName(user);
  const online = !!user.lastSeenAt && Date.now() - user.lastSeenAt < 120_000;
  // Name is a separate node rather than part of the string so the blur-PID
  // rule can reach it without hiding the presence suffix.
  const presenceSuffix = online
    ? " · Online"
    : user.lastSeenAt
      ? ` · Active ${compactRelativeTime(user.lastSeenAt)}`
      : "";
  const tooltip = (
    <>
      <span data-pii>{name}</span>
      {presenceSuffix}
    </>
  );
  const iconSizePx =
    size === "xl" ? 48 : size === "md" ? 24 : size === "lg" ? 32 : 16;
  const dotSize =
    size === "xl"
      ? "h-3.5 w-3.5"
      : size === "lg"
        ? "h-3 w-3"
        : size === "md"
          ? "h-2.5 w-2.5"
          : "h-1.5 w-1.5";

  const avatar = (
    <div className="relative flex items-center justify-center rounded-full bg-accent">
      <Facehash size={iconSizePx} name={initials} enableBlink interactive />
      {!hideLastSeen && user.lastSeenAt && (
        <span
          className={`absolute bottom-0 left-0 ${dotSize} block rounded-full border-2 border-background ${
            online ? "bg-success" : "bg-warning"
          }`}
        />
      )}
    </div>
  );

  // Inside the profile card itself — show only the avatar, no nested affordance.
  if (disableProfileCard) return avatar;

  // With a known user id we can show the full profile card on hover.
  if (userId) {
    return (
      <HoverCard openDelay={250} closeDelay={100}>
        <HoverCardTrigger asChild>{avatar}</HoverCardTrigger>
        <HoverCardContent
          align="start"
          side="top"
          className="w-72 border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
        >
          <UserProfileHoverCardBody userId={userId} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Preloaded-only avatars (no id to fetch a profile) keep the lightweight tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

type UserProfile = NonNullable<FunctionReturnType<typeof api.users.get>>;

function getRoleLabel(role: UserProfile["role"]): string | null {
  if (role === "business") return PERSONALISATION_PRESETS.business.label;
  if (role === "dev") return PERSONALISATION_PRESETS.dev.label;
  if (role === "designer") return PERSONALISATION_PRESETS.designer.label;
  return null;
}

function getDisplayName(user: UserProfile): string {
  const fromParts = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (fromParts) return fromParts;
  if (user.fullName?.trim()) return user.fullName.trim();
  if (user.email?.trim()) return user.email.trim();
  return "Unknown";
}

function getPresence(lastSeenAt?: number | null): {
  label: string;
  online: boolean;
} {
  if (!lastSeenAt) {
    return { label: "Offline", online: false };
  }
  const online = Date.now() - lastSeenAt < ONLINE_THRESHOLD_MS;
  if (online) {
    return { label: "Online", online: true };
  }
  return { label: `Active ${compactRelativeTime(lastSeenAt)}`, online: false };
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

/** Floating glass shell shared by every profile-card state. */
function ProfileCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-surface bg-popover/95 text-popover-foreground smooth-shadow-ring-lg backdrop-blur-md">
      {children}
    </div>
  );
}

/**
 * Profile card: an ambient aurora header (reusing the app shell's --ambient
 * glows), an avatar lifted onto it, then name, role and contact/presence meta.
 * Rendered inside a `HoverCardContent` by both `UserInitials` and the @mention
 * chip so the two surfaces stay identical.
 */
export function UserProfileHoverCardBody({ userId }: { userId: string }) {
  const user = useQuery(
    api.users.get,
    isUsersTableId(userId) ? { id: userId } : "skip",
  );

  if (user === undefined) {
    return (
      <ProfileCardShell>
        <div className="flex items-center justify-center py-10">
          <Spinner size="sm" />
        </div>
      </ProfileCardShell>
    );
  }

  if (user === null) {
    return (
      <ProfileCardShell>
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          User not found
        </p>
      </ProfileCardShell>
    );
  }

  const name = getDisplayName(user);
  const roleLabel = getRoleLabel(user.role);
  const presence = getPresence(user.lastSeenAt);

  return (
    <ProfileCardShell>
      {/* Ambient aurora header — same --ambient tokens as the app shell */}
      <div
        className="relative h-14"
        style={{ backgroundColor: "rgb(var(--ambient-1) / 0.08)" }}
      >
        <div
          className="pointer-events-none absolute -right-4 -top-8 size-20 rounded-full blur-2xl"
          style={{ backgroundColor: "rgb(var(--ambient-1) / 0.3)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-7 -left-6 size-20 rounded-full blur-2xl"
          style={{ backgroundColor: "rgb(var(--ambient-2) / 0.22)" }}
        />
      </div>

      <div className="px-4 pb-4">
        {/* Avatar lifted onto the header */}
        {isUsersTableId(userId) ? (
          <div className="-mt-8 mb-3 w-fit rounded-full ring-4 ring-popover">
            <UserInitials
              userId={userId}
              user={user}
              hideLastSeen
              size="xl"
              disableProfileCard
            />
          </div>
        ) : null}

        <p
          data-pii
          className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground"
        >
          {name}
        </p>
        {roleLabel ? (
          <span className="mt-1.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium leading-4 text-accent-foreground">
            {roleLabel}
          </span>
        ) : null}

        <div className="mt-3.5 space-y-2">
          {user.email ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MailIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span data-pii className="truncate">
                {user.email}
              </span>
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-xs">
            <span
              className="relative flex size-3.5 shrink-0 items-center justify-center"
              aria-hidden
            >
              <span
                className={
                  "size-1.5 rounded-full " +
                  (presence.online ? "bg-success" : "bg-muted-foreground/40")
                }
              />
            </span>
            <span
              className={
                presence.online ? "text-foreground" : "text-muted-foreground"
              }
            >
              {presence.label}
            </span>
          </div>
        </div>
      </div>
    </ProfileCardShell>
  );
}
