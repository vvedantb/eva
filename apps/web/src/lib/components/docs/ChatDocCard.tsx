"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import {
  Button,
  Markdown,
  Spinner,
  Surface,
  tokenTransition,
} from "@vvedantb/ui";
import { IconExternalLink, IconFileText } from "@tabler/icons-react";
import { m } from "motion/react";
import { CHAT_MARKDOWN_COMPONENTS } from "@/lib/components/chat/ChatMarkdownLink";
import { entityPathSegment } from "@/lib/numId";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

export interface ChatDocCardDoc {
  _id: Id<"docs">;
  numId?: number;
  title: string;
  contentPreview: string | null;
}

/**
 * A doc the agent wrote in this turn (`create_eva_doc`), shown under its
 * reply. Collapsed to its title and first line; "Read" loads the body inline,
 * and the link opens the full editor.
 */
export function ChatDocCard({
  doc,
  basePath,
}: {
  doc: ChatDocCardDoc;
  /** The chat's repo route prefix; without it there is no doc page to open. */
  basePath: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const segment = entityPathSegment(doc);
  const href =
    basePath !== undefined && segment !== null
      ? toInternalRepoHref(
          `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
        )
      : null;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
      data-testid="chat-doc-card"
    >
      <Surface
        density="tight"
        className="flex min-w-0 max-w-full flex-col gap-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-surface bg-muted text-muted-foreground">
            <IconFileText size={18} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {doc.title}
            </span>
            {doc.contentPreview && !expanded ? (
              <span className="truncate text-xs text-muted-foreground">
                {doc.contentPreview}
              </span>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Hide" : "Read"}
          </Button>
          {href ? (
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
            >
              <Link to={href} aria-label="Open document" title="Open document">
                <IconExternalLink className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
        {expanded ? <DocBody docId={doc._id} /> : null}
      </Surface>
    </m.div>
  );
}

/** The doc body, loaded on first open; the card rows carry only a preview. */
function DocBody({ docId }: { docId: Id<"docs"> }) {
  const doc = useQuery(api.docs.get, { id: docId });
  if (doc === undefined) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (doc === null || doc.content.trim().length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {doc === null ? "This document was deleted." : "This document is empty."}
      </p>
    );
  }
  return (
    <div className="max-h-[480px] overflow-y-auto wrap-anywhere text-sm">
      <Markdown mode="static" components={CHAT_MARKDOWN_COMPONENTS}>
        {doc.content}
      </Markdown>
    </div>
  );
}
