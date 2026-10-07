"use client";

import type { ReactNode } from "react";
import { UserInitials } from "@eva/shared/user-initials";
import type { AIProvider, Id } from "@eva/backend";
import {
  DocumentsIcon,
  ProjectsIcon,
  QuickTasksIcon,
  SessionsIcon,
} from "@/lib/components/sidebar/icons/AnimatedNavIcons";
import {
  ClaudeLogo,
  CursorLogo,
  OpenAILogo,
  OpenCodeLogo,
} from "@/lib/components/ui/providerLogos";

/**
 * What a Data `@` entry points at. Mirrors the backend `DataMentionKind` union
 * — a new kind there fails to assign here until it is given an icon below.
 */
export type MentionKind = "document" | "session" | "project" | "quickTask";

const KIND_ICON_CLASS = "shrink-0 text-muted-foreground";

/** Reuses the sidebar nav glyphs so a session in the picker reads like the
 *  Sessions nav item. Their hover animations are gated on `.group:hover`, so
 *  they stay still here. */
function MentionKindIcon({ kind }: { kind: MentionKind }) {
  switch (kind) {
    case "document":
      return <DocumentsIcon size={16} className={KIND_ICON_CLASS} />;
    case "session":
      return <SessionsIcon size={16} className={KIND_ICON_CLASS} />;
    case "project":
      return <ProjectsIcon size={16} className={KIND_ICON_CLASS} />;
    case "quickTask":
      return <QuickTasksIcon size={16} className={KIND_ICON_CLASS} />;
  }
}

/**
 * Badges that name an AI provider get its mark, so a Claude-provided skill is
 * recognisable before the word is read. Badges naming anything else (Eva,
 * Person) are text-only.
 */
const PROVIDER_LOGO: Record<
  AIProvider,
  (props: { size: number }) => ReactNode
> = {
  claude: ClaudeLogo,
  codex: OpenAILogo,
  opencode: OpenCodeLogo,
  cursor: CursorLogo,
};

/** The provider mark for a badge, or nothing when the badge names no provider. */
function BadgeLogo({
  provider,
}: {
  provider: AIProvider | undefined;
}): ReactNode {
  if (provider === undefined) return null;
  const Logo = PROVIDER_LOGO[provider];
  return <Logo size={11} />;
}

function previewOneLine(text: string, maxLength = 72): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

export interface MentionRowProps {
  /** The character that inserts this entry, shown before the label. */
  prefix: "@" | "/";
  label: string;
  description?: string;
  /** Source badge (e.g. Eva, Claude, Person). Suppressed when an icon is shown. */
  badge?: string;
  provider?: AIProvider;
  /** Data entity kind — renders a leading icon instead of the kind badge. */
  kind?: MentionKind;
  /** Set for teammates, whose avatar replaces the icon. */
  personUserId?: Id<"users">;
}

/**
 * One picker entry. Shared by the `@`/`/` popup and the composer "+" menu so
 * the same mention reads identically in both.
 */
export function MentionRow({
  prefix,
  label,
  description,
  badge,
  provider,
  kind,
  personUserId,
}: MentionRowProps): ReactNode {
  const detail = description ? previewOneLine(description) : null;
  // The kind icon takes the trailing slot the kind badge used to occupy, so
  // every label starts in the same column (a leading icon would indent data
  // rows past skill rows) and the type marker stays in one consistent place.
  // Only a teammate's avatar leads, because it identifies the person rather
  // than naming a type.
  const trailing =
    kind !== undefined ? (
      <MentionKindIcon kind={kind} />
    ) : badge !== undefined ? (
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
        <BadgeLogo provider={provider} />
        {badge}
      </span>
    ) : null;

  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      {personUserId !== undefined ? (
        <UserInitials userId={personUserId} size="sm" hideLastSeen />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
            {personUserId === undefined ? (
              <span className="shrink-0 text-muted-foreground">{prefix}</span>
            ) : null}
            <span
              data-pii={personUserId !== undefined ? "" : undefined}
              className="truncate"
            >
              {label}
            </span>
          </span>
          {trailing}
        </span>
        {detail ? (
          <span className="truncate text-xs text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </span>
  );
}
