import { IconDots, IconRefresh, IconSpaceOff } from "@tabler/icons-react-native";
import { HeaderIconButton, Sheet, SheetBody, SheetContent, SheetHeader, SheetRow, SheetTitle, Spinner } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useState } from "react";
import { useScheme } from "@/ui/theme";
import { useIgnoreWhitespace, usePendingLineComments, type PrRef } from "./prDiffStore";

/**
 * The web Code toolbar's ⋯ menu, as a sheet from a header button: Hide
 * whitespace changes (checked while on) and Refresh diff. The dots turn into
 * a spinner while a refresh runs. Wrap lines, split view and fold all have
 * nothing to act on at phone width: the diff is one unified column, one file
 * at a time.
 */
export function DiffOptions({ pr, refreshing, onRefresh }: { pr: PrRef; refreshing: boolean; onRefresh: () => void }) {
  const scheme = useScheme();
  const [open, setOpen] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useIgnoreWhitespace();
  const pending = usePendingLineComments(pr).comments.length;
  const toggleWhitespace = () => {
    setOpen(false);
    // The web refusal: pending comments are pinned to the lines on screen, and this rewrites them.
    if (pending > 0) {
      toast.info("Submit or delete pending review comments first — they are pinned to the lines on screen.");
      return;
    }
    setIgnoreWhitespace(!ignoreWhitespace);
  };
  return (
    <>
      <HeaderIconButton label={refreshing ? "Refreshing diff" : "More diff options"} onPress={() => setOpen(true)}>
        {refreshing ? <Spinner size="sm" decorative /> : <IconDots size={18} color={tokens.color.foreground[scheme]} />}
      </HeaderIconButton>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-3 px-3">
          <SheetHeader className="px-2">
            <SheetTitle>Diff options</SheetTitle>
          </SheetHeader>
          <SheetBody contentContainerClassName="gap-3">
            <SheetRow icon={IconSpaceOff} title="Hide whitespace changes" active={ignoreWhitespace} onPress={toggleWhitespace} />
            <SheetRow
              icon={IconRefresh}
              title="Refresh diff"
              disabled={refreshing}
              onPress={() => {
                setOpen(false);
                onRefresh();
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
