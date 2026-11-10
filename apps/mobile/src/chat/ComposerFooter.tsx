import { api, type Id } from "@eva/backend";
import { tokenizedToDisplayText } from "@eva/shared/mentionText";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconBookmark, IconFileText, IconX } from "@tabler/icons-react-native";
import { PROMPT_INPUT_CHIP, PromptInputChip } from "@vvedantb/native-ui/ai";
import { Sheet, SheetContent, SheetHeader, SheetRow, SheetTitle } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { fromNow } from "@/ui/format";
import { useScheme } from "@/ui/theme";

type StashEntry = FunctionReturnType<typeof api.promptStash.listForRepo>[number];

/** The web footer chips: `text-xs font-normal text-muted-foreground`, as Eva overrides the `ModelPicker` trigger. */
export function useFooterChipColor() {
  return EVA_THEME[useScheme()].mutedForeground;
}

/**
 * Eva's web under-composer bar (`ChatComposer` `mutedBar`): flush under the
 * field, 12 in from each side (`w-[calc(100%-1.5rem)]`), `bg-muted/70`, the
 * bottom corners at `rounded-b-surface` (16), `px-2 py-0.5 gap-0.5`. It holds
 * `leading` (a branch chip), the stash chip while anything is stashed, and
 * `model` at the end. Nothing to hold: no bar, as the web.
 *
 * Each chip opens a bottom sheet in place of the web popover. The chips are
 * the web 28 high and reach 44 with slop, so the bar keeps the web 32.
 */
export function ComposerFooter({
  leading,
  repoId,
  draft,
  onDraftChange,
  model,
}: {
  leading?: ReactNode;
  /** The repo the stash is saved against (the web stash is per user and repo). */
  repoId: Id<"githubRepos"> | undefined;
  /** The composer text, which a restored stash is added to. */
  draft: string;
  onDraftChange: (text: string) => void;
  /** The model chip. Simple view hides it, as the web composer. */
  model?: ReactNode;
}) {
  const theme = EVA_THEME[useScheme()];
  const simpleView = useSimpleView();
  const entries = useQuery(api.promptStash.listForRepo, repoId ? { repoId } : "skip") ?? [];
  const stash = entries.length > 0 ? <StashChip entries={entries} draft={draft} onDraftChange={onDraftChange} /> : null;
  const modelChip = simpleView ? null : model;
  if (!leading && !stash && !modelChip) return null;
  return (
    <View
      className="mx-3 flex-row items-center gap-0.5 px-2 py-0.5"
      style={{ backgroundColor: withAlpha(theme.muted, 0.7), borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
    >
      {/* 390 wide, the three chips want a few points more than the bar. The
          model gives them up: its name stays and the trait summary truncates.
          A long branch truncates at 40%, the web `max-w-[min(220px,40vw)]`. */}
      {leading ? (
        <View className="shrink-0" style={{ maxWidth: "40%" }}>
          {leading}
        </View>
      ) : null}
      {stash ? <View className="shrink-0">{stash}</View> : null}
      {modelChip ? <View className="ml-auto min-w-0 shrink">{modelChip}</View> : null}
    </View>
  );
}

/** The web Simple view opt-in (`auth.getExperimentalFlags`); false while it loads. */
export function useSimpleView(): boolean {
  return useQuery(api.auth.getExperimentalFlags, {})?.simpleView === true;
}

/**
 * A footer chip's bottom sheet: the title, then `children` in a scroll view
 * capped at 60% of the screen, so a long list keeps the sheet in one hand's
 * reach and scrolls. `header` sits above the scroll (search, traits).
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
  const { height } = useWindowDimensions();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-3 px-3">
        <SheetHeader className="px-2">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {header}
        <ScrollView style={{ maxHeight: height * 0.6 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
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
 * Stashing a draft is ⌘S on the web, which a phone has no key for.
 */
function StashChip({
  entries,
  draft,
  onDraftChange,
}: {
  entries: StashEntry[];
  draft: string;
  onDraftChange: (text: string) => void;
}) {
  const color = useFooterChipColor();
  const [open, setOpen] = useState(false);
  const remove = useMutation(api.promptStash.remove);

  const restore = (entry: StashEntry) => {
    // The web turns the stashed files back into composer attachments; the
    // phone composer uploads only what it picks, so it says so, as the web
    // does for files its composer cannot take.
    if (entry.attachments.length > 0) {
      toast.error("This stash has attachments this composer cannot accept.");
      return;
    }
    // The stored text, mention and skill tokens included, so a send still
    // mentions whom the stashed prompt did. Added after any draft, as the web.
    onDraftChange(draft.trim() === "" ? entry.content : `${draft}\n\n${entry.content}`);
    setOpen(false);
    // Already restored: keep the entry rather than lose it, as the web.
    remove({ id: entry._id }).catch(() => toast.error("Restored, but could not remove stash entry."));
  };

  return (
    <>
      <PromptInputChip
        icon={<IconBookmark size={PROMPT_INPUT_CHIP.iconSize} color={color} />}
        label="Stash"
        count={entries.length}
        chevron={false}
        weight="normal"
        color={color}
        accessibilityLabel={`Prompt stash, ${entries.length} saved`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet open={open} onOpenChange={setOpen} title={`Stash · ${entries.length}`}>
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
