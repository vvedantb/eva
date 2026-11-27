"use client";

import { Badge, ListRow, MarqueeOnHover } from "@vvedantb/ui";
import { cn } from "@eva/ui";
import type { Id } from "@eva/backend";
import { tokenizedToDisplayText } from "@eva/shared";
import { useNavigate } from "@tanstack/react-router";
import { statusConfig } from "@/lib/components/tasks/TaskStatusBadge";

interface QuickTaskDraftRowProps {
  id: Id<"agentTasks">;
  title: string;
  description?: string;
}

const draftStyle = statusConfig.draft;

/**
 * The user's own quick-task draft at the top of the To Do column. Only its
 * creator sees it; it opens the New Quick Task modal on the draft, as the
 * Drafts page does. Not a task card: no drag, no selection.
 */
export function QuickTaskDraftRow({
  id,
  title,
  description,
}: QuickTaskDraftRowProps) {
  const snippet = description ? tokenizedToDisplayText(description) : "";
  const label = title || "Untitled";
  const Icon = draftStyle.icon;
  const navigate = useNavigate();
  return (
    <ListRow
      accentClassName={draftStyle.bar}
      onClick={() =>        void navigate({ to: ".", search: (prev) => ({ ...prev, draft: id }) })
      }
      aria-label={`Draft: ${label}`}
      contentClassName="flex flex-col gap-1.5 px-2.5 py-2 pl-3 sm:px-3 sm:py-2.5 sm:pl-3.5"
    >
      <MarqueeOnHover
        className={cn(
          "min-w-0 text-2sm font-medium leading-5 tracking-[-0.01em] transition-colors duration-[var(--motion-base)] group-hover:text-primary",
          title ? "text-foreground" : "italic text-muted-foreground",
        )}
      >
        {label}
      </MarqueeOnHover>
      {snippet ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {snippet}
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <Badge
          className={cn(
            "gap-0.5 border-transparent px-1.5 py-0 text-3xs font-medium leading-4",
            draftStyle.bg,
            draftStyle.text,
          )}
        >
          <Icon className="size-2.5 shrink-0" />
          {draftStyle.label}
        </Badge>
      </div>
    </ListRow>
  );
}
