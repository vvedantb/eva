"use client";

import { Button, Spinner, Surface, Textarea } from "@vvedantb/ui";
import { SECTION_LABEL_CLASS } from "./prOverviewMeta";

/**
 * The description editor: the read view's card, replaced in place by a textarea
 * and the two buttons that close it. Lives in its own file so the section that
 * owns the draft stays a single screen of reading.
 *
 * Stateless on purpose — the draft belongs to the section, where "is this being
 * edited?" and "what has been typed?" are one piece of state.
 */
export function PrDescriptionEditor({
  draft,
  onDraftChange,
  onCancel,
  onSave,
  saving,
  error,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-2">
      <p className={SECTION_LABEL_CLASS}>Edit description</p>

      <Surface density="tight" className="space-y-3">
        <Textarea
          className="min-h-40 text-sm"
          value={draft}
          placeholder="Describe this pull request"
          aria-label="Pull request description"
          onChange={(event) => onDraftChange(event.target.value)}
        />

        {error === null ? null : (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* eva authenticates as its GitHub App, so the edit is attributed to
              the app rather than to the reader's account. */}
          <p className="text-xs text-muted-foreground">
            Saved to GitHub as the eva app.
          </p>
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : null}
              Save
            </Button>
          </span>
        </div>
      </Surface>
    </section>
  );
}
