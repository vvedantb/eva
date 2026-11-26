"use client";

import type { ReactNode } from "react";
import { UserInitials } from "@eva/shared/user-initials";
import type { AIProvider, Id } from "@eva/backend";
import type { MentionKind } from "@eva/shared";
import {
  BoardIcon,
  ChecklistIcon,
  DocumentIcon,
  ProviderIcon,
  TerminalIcon,
} from "@vvedantb/ui";

/** A new `MentionKind` fails the exhaustive switch below until it has an icon. */
export type { MentionKind };

const KIND_ICON_CLASS = "shrink-0 text-muted-foreground";

function MentionKindIcon({ kind }: { kind: MentionKind }) {
  switch (kind) {
    case "document":
      return <DocumentIcon size={16} className={KIND_ICON_CLASS} />;
    case "session":
      return <TerminalIcon size={16} className={KIND_ICON_CLASS} />;
    case "project":
      return <BoardIcon size={16} className={KIND_ICON_CLASS} />;
    case "quickTask":
      return <ChecklistIcon size={16} className={KIND_ICON_CLASS} />;
  }
}

function BadgeLogo({
  provider,
}: {
  provider: AIProvider | undefined;
}): ReactNode {
  if (provider === undefined) return null;
  return <ProviderIcon provider={provider} size={11} />;
}

function previewOneLine(text: string, maxLength = 72): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

export interface MentionRowProps {
  prefix: "@" | "/";
  label: string;
  description?: string;
  badge?: string;
  provider?: AIProvider;
  kind?: MentionKind;
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
  const trailing =
    kind !== undefined ? (
      <MentionKindIcon kind={kind} />
    ) : badge !== undefined ? (
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-3xs font-medium leading-none text-muted-foreground">
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
