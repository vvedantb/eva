import type { ReactNode } from "react";

interface MentionContentPreviewProps {
  title: string;
  children: ReactNode;
}

/** The floating surface every mention hover card draws (width set by caller). */
export const MENTION_PREVIEW_SURFACE_CLASS =
  "max-w-[calc(100vw-2rem)] rounded-surface bg-popover/95 p-3 backdrop-blur-md smooth-shadow-ring-lg";

/** Scrollable hover preview for doc/skill mention chips. */
export function MentionContentPreview({
  title,
  children,
}: MentionContentPreviewProps) {
  return (
    <div className={`${MENTION_PREVIEW_SURFACE_CLASS} w-72`}>
      <p className="mb-2 text-xs font-medium text-foreground">{title}</p>
      <div className="max-h-[min(15rem,50dvh)] overflow-y-auto scrollbar scroll-fade text-xs text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
