import { api, type Id } from "@eva/backend";
import { tokenizedToDisplayText } from "@eva/shared/mentionText";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconBookmark, IconBookmarkPlus, IconFileText, IconX } from "@tabler/icons-react-native";
import { Attachment, Attachments, PROMPT_INPUT_CHIP, PromptInputChip } from "@vvedantb/native-ui/ai";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetRow, SheetTitle } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ComposerMentionChips } from "@/chat/MentionChip";
import type { useAttachments } from "@/chat/useAttachments";
import type { useMentionComposer } from "@/chat/useMentionComposer";
import { fromNow } from "@/ui/format";
import { useScheme } from "@/ui/theme";

type StashEntry = FunctionReturnType<typeof api.promptStash.listForRepo>[number];
type Composer = ReturnType<typeof useMentionComposer>;
type ComposerAttachments = ReturnType<typeof useAttachments>;

/**
 * Above the field: the picked images, then the `@` / `/` picks as chips
 * (`ComposerMentionChips`). Nothing to show: no row.
 */
export function ComposerHeader({ attachments, composer }: { attachments: ComposerAttachments; composer: Composer }) {
  if (attachments.items.length === 0 && composer.picks.length === 0) return null;
  return (
    <>
      {attachments.items.length > 0 ? (
        <Attachments>
          {attachments.items.map((item) => (
            <Attachment key={item.id} data={item} onRemove={() => attachments.remove(item.id)} />
          ))}
        </Attachments>
      ) : null}
      <ComposerMentionChips picks={composer.picks} onRemove={composer.removePick} />
    </>
  );
}

/**
 * Every footer chip's shape: the web `text-xs font-normal`, as Eva overrides
 * the `ModelPicker` trigger, at the kit's phone size (36 high in a 44 bar, so
 * a tap lands on the chip, not the field above) in place of the web 28.
 */
export const FOOTER_CHIP = { size: "touch", weight: "normal" } as const;

/** The web footer chips' `text-muted-foreground`. */
export function useFooterChipColor() {
  return EVA_THEME[useScheme()].mutedForeground;
}

/**
 * Eva's web under-composer bar (`ChatComposer` `mutedBar`): flush under the
 * field, 12 in from each side (`w-[calc(100%-1.5rem)]`), `bg-muted/70`, the
 * bottom corners at `rounded-b-surface` (16), `px-2 py-0.5 gap-0.5`. It holds
 * `leading` (a branch chip), the stash chip while anything is stashed (or,
 * on the phone, while the draft could be stashed), and `model` at the end.
 * Nothing to hold: no bar, as the web.
 *
 * Each chip opens a bottom sheet in place of the web popover. The chips are
 * 36 high (`FOOTER_CHIP`) and the bar 44 (`py-1`), so each chip's 44 target
 * stays inside the bar; the web 28 chips in a 32 bar are a mouse's density.
 */
export function ComposerFooter({
  leading,
  repoId,
  composer,
  attachments,
  model,
}: {
  leading?: ReactNode;
  /** The repo the stash is saved against (the web stash is per user and repo). */
  repoId: Id<"githubRepos"> | undefined;
  /** The draft the stash saves and restores into. */
  composer: Composer;
  /** The draft's images, stashed with it. */
  attachments: ComposerAttachments;
  /** The model chip. Simple view hides it, as the web composer. */
  model?: ReactNode;
}) {
  const theme = EVA_THEME[useScheme()];
  const simpleView = useSimpleView();
  const entries = useQuery(api.promptStash.listForRepo, repoId ? { repoId } : "skip") ?? [];
  const hasDraft = composer.text.trim() !== "" || attachments.items.length > 0;
  const stash =
    repoId && (entries.length > 0 || hasDraft) ? (
      <StashChip repoId={repoId} entries={entries} composer={composer} attachments={attachments} />
    ) : null;
  const modelChip = simpleView ? null : model;
  if (!leading && !stash && !modelChip) return null;
  return (
    <View
      className="mx-3 flex-row items-center gap-0.5 px-2 py-1"
      style={{ backgroundColor: withAlpha(theme.muted, 0.7), borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
    >
      {/* As the web phone bar: the leading control takes what the stash and
          the model leave (`flex-1 basis-0`), so its label truncates first and
          the model keeps its name and trait ("· High"). It never goes below
          an icon and a chevron, and never past 40% (the web branch chip's
          `max-w-[min(220px,40vw)]`). The model truncates only when it alone
          does not fit. */}
      {leading ? (
        <View className="flex-1 flex-row" style={{ minWidth: LEADING_MIN_WIDTH, maxWidth: "40%" }}>
          {leading}
        </View>
      ) : null}
      {stash ? <View className="shrink-0">{stash}</View> : null}
      {modelChip ? <View className="ml-auto min-w-0 shrink">{modelChip}</View> : null}
    </View>
  );
}

/** A chip squeezed to its icon and chevron, as the web branch chip at 390: `px-2`, 14 icon, two 6 gaps, 12 chevron. */
const LEADING_MIN_WIDTH =
  2 * PROMPT_INPUT_CHIP.paddingX + PROMPT_INPUT_CHIP.iconSize + 2 * PROMPT_INPUT_CHIP.gap + PROMPT_INPUT_CHIP.chevronSize;

/** The web Simple view opt-in (`auth.getExperimentalFlags`); false while it loads. */
export function useSimpleView(): boolean {
  return useQuery(api.auth.getExperimentalFlags, {})?.simpleView === true;
}

/**
 * A footer chip's bottom sheet: the title, then `children` in a scroll view
 * (`SheetBody`) capped at 60% of the screen, so a long list keeps the sheet
 * in one hand's reach and scrolls; with the keyboard up it scrolls in what is
 * left. `header` sits above the scroll (search, traits).
 */
export function FooterSheet({
  open,
  onOpenChange,
  title,
  header,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-3 px-3">
        <SheetHeader className="px-2">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {header}
        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** The web stash row snippet: one line of display text, or "(attachments only)". */
function previewSnippet(tokenized: string): string {
  const line = tokenizedToDisplayText(tokenized).replace(/\s+/g, " ").trim();
  return line.length === 0 ? "(attachments only)" : line;
}

/**
 * The web stash trigger (bookmark, "Stash", the count in medium tabular
 * figures, no chevron) and its drawer as a sheet: newest first, a row restores
 * the prompt into the composer and takes it off the stash, × deletes it.
 * Stashing a draft is ⌘S on the web, which a phone has no key for, so the
 * sheet starts with "Stash this prompt" (the same `promptStash.add`), and the
 * chip shows while there is a draft to stash, even with nothing stashed yet.
 */
function StashChip({
  repoId,
  entries,
  composer,
  attachments,
}: {
  repoId: Id<"githubRepos">;
  entries: StashEntry[];
  composer: Composer;
  attachments: ComposerAttachments;
}) {
  const color = useFooterChipColor();
  const [open, setOpen] = useState(false);
  const remove = useMutation(api.promptStash.remove);
  const add = useMutation(api.promptStash.add);
  const draft = composer.text.trim();
  const canStash = draft !== "" || attachments.items.length > 0;

  // The web `useComposerStash().stash`: the field clears at once and the text
  // comes back (with its picks) if the save fails.
  const stashDraft = () => {
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    const content = composer.tokenize(draft);
    const attachmentStorageIds = attachments.storageIds;
    composer.setText("");
    attachments.clear();
    setOpen(false);
    add({ repoId, content, attachmentStorageIds: attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined })
      .then((result) => {
        if (result.evicted) toast("Oldest stash removed (limit 20 per app).");
      })
      .catch(() => {
        toast.error("Could not stash prompt.");
        composer.restore(content);
      });
  };

  const restore = (entry: StashEntry) => {
    // The web turns the stashed files back into composer attachments; the
    // phone composer uploads only what it picks, so it says so, as the web
    // does for files its composer cannot take.
    if (entry.attachments.length > 0) {
      toast.error("This stash has attachments this composer cannot accept.");
      return;
    }
    // The stored tokens come back as picks, so a send still mentions whom the
    // stashed prompt did. Added after any draft, as the web.
    composer.restore(entry.content);
    setOpen(false);
    // Already restored: keep the entry rather than lose it, as the web.
    remove({ id: entry._id }).catch(() => toast.error("Restored, but could not remove stash entry."));
  };

  return (
    <>
      <PromptInputChip
        icon={<IconBookmark size={PROMPT_INPUT_CHIP.iconSize} color={color} />}
        label="Stash"
        count={entries.length > 0 ? entries.length : undefined}
        chevron={false}
        {...FOOTER_CHIP}
        color={color}
        accessibilityLabel={`Prompt stash, ${entries.length} saved`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet open={open} onOpenChange={setOpen} title={`Stash · ${entries.length}`}>
        <SheetRow
          icon={IconBookmarkPlus}
          title="Stash this prompt"
          detail={canStash ? previewSnippet(draft) : "Write a prompt to stash it."}
          disabled={!canStash}
          onPress={stashDraft}
        />
        {entries.map((entry) => (
          <View key={entry._id} className="flex-row items-center">
            <View className="min-w-0 flex-1">
              <SheetRow
                icon={IconFileText}
                title={previewSnippet(entry.content)}
                detail={[
                  fromNow(entry._creationTime),
                  entry.attachments.length > 0
                    ? `${entry.attachments.length} attachment${entry.attachments.length === 1 ? "" : "s"}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onPress={() => restore(entry)}
              />
            </View>
            {/* The web row's × (always shown at phone width), a 44 target beside the row, not inside it. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete stash"
              className="size-11 items-center justify-center rounded-full active:opacity-70"
              onPress={() => {
                remove({ id: entry._id }).catch(() => toast.error("Could not delete stash."));
              }}
            >
              <IconX size={16} color={color} />
            </Pressable>
          </View>
        ))}
      </FooterSheet>
    </>
  );
}
