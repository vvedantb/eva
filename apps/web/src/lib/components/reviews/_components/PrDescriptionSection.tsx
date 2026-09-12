"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Surface,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconChevronRight,
  IconExternalLink,
  IconPencil,
} from "@tabler/icons-react";
import { Streamdown } from "streamdown";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { usePrEdit } from "../usePrEdit";
import { MARKDOWN_CLASS, type PrOverview } from "./prOverviewMeta";
import { PrDescriptionEditor } from "./PrDescriptionEditor";

/**
 * The pull request description, as its own region above the conversation rather
 * than the first bubble inside it.
 *
 * eva's agents write long descriptions, and as a timeline row that pushed every
 * human comment below the fold — the thing a reviewer came to read was the thing
 * hardest to reach. Collapsing it here puts the choice with the reader.
 *
 * A card, tone only, headed by who opened the pull request and when. It read as an
 * uppercase section label over bare prose before, which is the right register for
 * a form section and the wrong one here: this is somebody's opening statement, so
 * it is attributed and contained exactly like the comments it sits above. Edit and
 * the GitHub link still only appear on hover or focus, so the resting card is the
 * byline and the prose.
 *
 * One piece of state holds both halves of the editor: a string is the draft being
 * written, `null` means the description is being read rather than edited.
 */
export function PrDescriptionSection({
  repoId,
  overview,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  // Saving patches the query caches, so the section re-reads the new description
  // as soon as the editor closes — nothing here has to hold the saved text.
  const edit = usePrEdit(repoId, overview.number, () => setDraft(null));

  const body = overview.body ?? "";
  const hasBody = body.trim().length > 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {draft !== null ? (
        <m.div
          key="edit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          <PrDescriptionEditor
            draft={draft}
            onDraftChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => edit.save({ body: draft })}
            saving={edit.saving}
            error={edit.error}
          />
        </m.div>
      ) : (
        <m.div
          key="read"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionFast}
        >
          {/* Plain `group` on the card, not on the Collapsible inside it:
              `reveal-on-hover transition-opacity` keys off the unnamed group, and
              the card is the whole hover target the reader aims at. */}
          <Surface density="tight" className="group">
      <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/* The house Collapsible, not Accordion: an accordion item carries a
              bottom rule and a row-height trigger, which is the wrong register
              for one region of body copy — and this way the panel animates its
              measured height (`t-collapsible-content`) instead of snapping. */}
          <CollapsibleTrigger className="max-sm:hit-target motion-press flex min-w-0 items-center gap-2 hover:text-foreground active:scale-[0.98] [&[data-state=open]>svg]:rotate-90">
            <IconChevronRight
              size={13}
              aria-hidden
              // Same duration as the panel, so glyph and content settle together.
              className="shrink-0 transition-transform duration-[var(--motion-base)]"
            />
            <AuthorAvatar
              login={overview.authorLogin}
              avatarUrl={overview.authorAvatarUrl}
            />
            <span className="truncate font-medium text-foreground">
              {overview.authorLogin ?? "unknown"}
            </span>
            <span className="shrink-0">opened this pull request</span>
          </CollapsibleTrigger>

          {/* Outside the trigger: the timestamp carries a tooltip of its own, and
              a hover target inside a button is a hover target nobody can reach. */}
          <span aria-hidden>·</span>
          <RelativeDateTime
            at={new Date(overview.createdAt).getTime()}
            className="shrink-0"
          />

          {/* Held back until the reader is in this region: two controls sitting
              permanently beside a byline read as chrome to skip past. Shipped
              visible below `sm`, where there is no hover to hold them back. */}
          <span className="reveal-on-hover transition-opacity ml-auto flex shrink-0 items-center gap-3">
            <button
              type="button"
              className="max-sm:hit-target inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => setDraft(body)}
            >
              <IconPencil size={12} aria-hidden />
              Edit
            </button>
            <a
              href={overview.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-sm:hit-target hover:text-foreground"
              aria-label="View on GitHub"
            >
              <IconExternalLink size={12} aria-hidden />
            </a>
          </span>
        </div>

        <CollapsibleContent>
          {hasBody ? (
            <Streamdown className={MARKDOWN_CLASS}>{body}</Streamdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              No description yet. Add one to say what changed and why.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Surface>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The opener's avatar, at byline scale. No rail to mask here, so unlike the
 * timeline's avatar it carries no background ring.
 */
function AuthorAvatar({
  login,
  avatarUrl,
}: {
  login: string | null;
  avatarUrl: string | null;
}) {
  if (avatarUrl !== null) {
    return (
      <img src={avatarUrl} alt="" className="size-5 shrink-0 rounded-full" />
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium uppercase text-muted-foreground">
      {login === null ? "?" : login.slice(0, 2)}
    </span>
  );
}
