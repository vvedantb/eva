import {
  ASSISTANT_CITATION_MAX_CHARS,
  citationPreview,
  createCitation,
  type AssistantCitation,
} from "@eva/shared/assistantCitation";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconQuote, IconX } from "@tabler/icons-react-native";
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The web's "Cite" on a phone. A press on a highlighted span cannot work
 * there: a press and hold opens the message menu. So the menu has "Select
 * text", which opens the reply as selectable text in a sheet; the person
 * highlights a part and taps "Quote". Each quote waits above the field as a
 * chip, and goes with the next send as a `<cited_assistant>` block, as the
 * web's (`appendCitationsToPrompt`). Kept by the chat screen, so the hold
 * menu (in the transcript) and the composer (in the dock) share them.
 */
export function useQuotes() {
  const [items, setItems] = useState<AssistantCitation[]>([]);
  const [selecting, setSelecting] = useState<{ messageId: string; text: string } | null>(null);
  const add = (citation: AssistantCitation) => setItems((current) => [...current, citation]);
  return {
    items,
    remove: (id: string) => setItems((current) => current.filter((item) => item.id !== id)),
    /** After a send: drops only the quotes it carried, as the web, not any added while it was in flight. */
    drop: (sent: readonly AssistantCitation[]) => setItems((current) => current.filter((item) => !sent.includes(item))),
    /** The hold menu's "Select text": opens the reply in the sheet. */
    select: (messageId: string, text: string) => setSelecting({ messageId, text }),
    sheet: (
      <SelectTextSheet
        // A new reply starts with nothing highlighted.
        key={selecting?.messageId ?? "none"}
        target={selecting}
        onClose={() => setSelecting(null)}
        onQuote={(citation) => {
          add(citation);
          setSelecting(null);
        }}
      />
    ),
  };
}

export type Quotes = ReturnType<typeof useQuotes>;

/**
 * The reply's text in a field the person can highlight but not change: no
 * keyboard opens (`showSoftInputOnFocus`), and the value is fixed. Android
 * lets a field's text be selected only while it is editable, and only a field
 * reports what is selected (`onSelectionChange`), so not a selectable `Text`.
 */
function SelectTextSheet({
  target,
  onClose,
  onQuote,
}: {
  target: { messageId: string; text: string } | null;
  onClose: () => void;
  onQuote: (citation: AssistantCitation) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const text = target?.text ?? "";
  const selected = text.slice(selection.start, selection.end);

  const quote = () => {
    if (!target) return;
    const citation = createCitation({ messageId: target.messageId, text: selected });
    if (!citation) {
      toast.error(selected.trim().length > ASSISTANT_CITATION_MAX_CHARS ? "Selection is too long to quote" : "Couldn't quote that selection");
      return;
    }
    onQuote(citation);
  };

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="gap-3 px-4">
        <SheetHeader>
          <SheetTitle>Select text</SheetTitle>
          <SheetDescription>Highlight part of the reply, then tap Quote.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <TextInput
            value={text}
            multiline
            scrollEnabled={false}
            showSoftInputOnFocus={false}
            // Fixed: a change (a paste, a hardware key) is dropped, as the value prop wins.
            onChangeText={() => undefined}
            onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
            accessibilityLabel="Reply text"
            accessibilityHint="Select the part to quote"
            className="font-instrument-sans text-sm"
            style={{ color: theme.foreground, lineHeight: 20, padding: 0, textAlignVertical: "top" }}
            selectionColor={theme.primary}
          />
        </SheetBody>
        <SheetFooter>
          <Button disabled={selected.trim() === ""} leftIcon={<IconQuote size={16} color={theme.primaryForeground} />} onPress={quote}>
            Quote
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The quotes waiting above the field, as the web `PendingCitationChips`: a
 * quote mark and the start of the quote in a bordered card chip. A tap takes
 * it out (it shows ×), as the phone's mention chips; 32 high, 44 with slop.
 */
export function QuoteChips({ quotes }: { quotes: Pick<Quotes, "items" | "remove"> }) {
  const theme = EVA_THEME[useScheme()];
  return quotes.items.map((quote) => {
    const label = citationPreview(quote);
    return (
      <Pressable
        key={quote.id}
        accessibilityRole="button"
        accessibilityLabel={`Remove citation: ${label}`}
        hitSlop={{ top: 6, bottom: 6 }}
        onPress={() => quotes.remove(quote.id)}
        className="h-8 max-w-full flex-row items-center gap-1 rounded-md border pl-2 pr-1.5 active:opacity-70"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <IconQuote size={14} color={theme.mutedForeground} />
        <Text numberOfLines={1} className="shrink font-instrument-sans text-sm" style={{ color: theme.foreground }}>
          {label}
        </Text>
        <IconX size={12} color={theme.foreground} />
      </Pressable>
    );
  });
}

/**
 * A quote in a sent message, as the web `CitationCard`: the quote in a card,
 * muted with a quote mark, at most four lines, and the note under it.
 */
export function QuoteCard({ text }: { text: string }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="flex-row items-start gap-2 rounded-lg border px-3 py-2.5" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="pt-0.5">
        <IconQuote size={14} color={theme.mutedForeground} />
      </View>
      <Text numberOfLines={4} className="min-w-0 flex-1 font-instrument-sans text-xs" style={{ color: theme.mutedForeground, lineHeight: 19 }}>
        {text}
      </Text>
    </View>
  );
}
