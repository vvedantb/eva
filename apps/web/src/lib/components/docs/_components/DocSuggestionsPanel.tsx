"use client";

import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@eva/backend";
import { UserInitials } from "@eva/shared/user-initials";
import { Button, cn, LIST_ROW_CONTROL_CLASS, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconX, IconCheck, IconArrowBackUp } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { CountPop } from "@/lib/components/ui/CountPop";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  collectSuggestions,
  acceptSuggestion,
  rejectSuggestion,
  acceptAllSuggestions,
  rejectAllSuggestions,
  revealSuggestion,
  type SuggestionInfo,
} from "@/lib/components/editor/suggestChanges";
import { DOC_SIDE_PANEL_CLASS } from "./docSidePanel";

/** 24px beside a pointer, a full 40px tap target below `sm`. */
const PANEL_ACTION_CLASS = "h-6 px-1.5 text-xs max-sm:h-10 max-sm:px-3";

const KIND_LABEL: Record<SuggestionInfo["kind"], string> = {
  insertion: "Insertion",
  deletion: "Deletion",
  modification: "Change",
};

const KIND_DOT: Record<SuggestionInfo["kind"], string> = {
  insertion: "bg-success",
  deletion: "bg-destructive",
  modification: "bg-warning",
};

export function DocSuggestionsPanel({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const suggestions = useEditorState({
    editor,
    selector: ({ editor: e }) => collectSuggestions(e.state.doc),
  });
  const list = suggestions ?? [];

  return (
    <div className={DOC_SIDE_PANEL_CLASS}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex max-sm:min-w-0 items-center gap-2">
          <span className="max-sm:truncate text-sm font-medium">
            Suggestions
          </span>
          <CountPop
            label={String(list.length)}
            className="max-sm:shrink-0 text-xs text-muted-foreground"
          />
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          // 24px on desktop, as before; `icon-sm` is 32px and only wanted on touch.
          className="sm:size-6"
          aria-label="Close suggestions"
          onClick={onClose}
        >
          <IconX size={14} aria-hidden />
        </Button>
      </div>

      <AnimatePresence>
        {list.length > 0 ? (
          <m.div
            key="suggestion-toolbar"
            className="flex max-sm:flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 max-sm:gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <Button
              size="sm"
              variant="ghost"
              className={PANEL_ACTION_CLASS}
              onClick={() => acceptAllSuggestions(editor)}
            >
              <IconCheck size={12} aria-hidden />
              Accept all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={PANEL_ACTION_CLASS}
              onClick={() => rejectAllSuggestions(editor)}
            >
              <IconArrowBackUp size={12} aria-hidden />
              Reject all
            </Button>
          </m.div>
        ) : null}
      </AnimatePresence>

      <div className="scrollbar scroll-fade flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No suggestions yet. Switch to Suggesting mode and edit to propose
            changes.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {list.map((s, index) => (
              <m.div
                key={s.id}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <ListEnter index={index} fast>
                  <SuggestionRow editor={editor} suggestion={s} />
                </ListEnter>
              </m.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({
  editor,
  suggestion,
}: {
  editor: Editor;
  suggestion: SuggestionInfo;
}) {
  const userId = toUserId(suggestion.userId);
  return (
    <div className="relative border-b border-border p-3 transition-colors hover:bg-accent/40">
      {/* A real button stretched across the row rather than `onClick` on the
          wrapper: the row had no keyboard path and no role at all. The row keeps
          its own controls, which is why this is an overlay and not a wrapper —
          they opt back above it with `LIST_ROW_CONTROL_CLASS`. */}
      <button
        type="button"
        aria-label={`Reveal ${KIND_LABEL[suggestion.kind].toLowerCase()} in the document`}
        onClick={() => revealSuggestion(editor, suggestion.id)}
        className="absolute inset-0 z-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
      />
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            KIND_DOT[suggestion.kind],
          )}
        />
        {userId ? <UserInitials userId={userId} size="sm" /> : null}
        <SuggestionAuthorName userId={userId} />
        <span className="text-[10px] text-muted-foreground">
          {KIND_LABEL[suggestion.kind]}
        </span>
        {suggestion.createdAt !== null && (
          <RelativeDateTime
            at={suggestion.createdAt}
            className="ml-auto text-[10px] text-muted-foreground"
          />
        )}
      </div>

      {suggestion.text.trim().length > 0 && (
        <p
          className={cn(
            "mt-1 line-clamp-2 text-xs",
            suggestion.kind === "deletion"
              ? "text-destructive line-through"
              : "text-foreground",
          )}
        >
          {suggestion.text}
        </p>
      )}

      <div
        className={cn(
          LIST_ROW_CONTROL_CLASS,
          "mt-2 flex max-sm:flex-wrap items-center gap-1 max-sm:gap-2",
        )}
      >
        <Button
          size="sm"
          variant="ghost"
          className={PANEL_ACTION_CLASS}
          onClick={() => acceptSuggestion(editor, suggestion.id)}
        >
          <IconCheck size={12} aria-hidden />
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={PANEL_ACTION_CLASS}
          onClick={() => rejectSuggestion(editor, suggestion.id)}
        >
          <IconArrowBackUp size={12} aria-hidden />
          Reject
        </Button>
      </div>
    </div>
  );
}

type UserProfile = FunctionReturnType<typeof api.users.get>;

function SuggestionAuthorName({ userId }: { userId: Id<"users"> | null }) {
  const user = useQuery(api.users.get, userId ? { id: userId } : "skip");
  return (
    <span data-pii className="truncate text-xs font-medium">
      {authorName(userId, user)}
    </span>
  );
}

function authorName(
  userId: Id<"users"> | null,
  user: UserProfile | undefined,
): string {
  if (!userId) return "Someone";
  if (user === undefined) return "…";
  if (user === null) return "Unknown";
  if (user.fullName?.trim()) return user.fullName.trim();
  const parts = [user.firstName, user.lastName].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  if (parts.length > 0) return parts.join(" ");
  if (user.email?.trim()) return user.email.trim();
  return "Unknown";
}

/** Matches a Convex users-table id (mirrors the guard in user-initials.tsx). */
const USER_ID_PATTERN = /^[a-z0-9_]{16,40}$/;

function isUserId(id: string): id is Id<"users"> {
  return USER_ID_PATTERN.test(id);
}

/** Narrows a suggestion id's author segment to a real users-table id. */
function toUserId(userId: string | null): Id<"users"> | null {
  return userId && isUserId(userId) ? userId : null;
}
