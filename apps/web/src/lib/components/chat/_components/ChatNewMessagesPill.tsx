import { Button, cn, motionSpring } from "@eva/ui";
import { IconArrowUp, IconX } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

/**
 * One half of the split pill. The default variant gives the `primary` fill.
 * Overrides: scroll-button height and type, square inner corners, and no press
 * scale, because one half shrinking alone tears the pill apart.
 */
const PILL_HALF =
  "h-7 px-0 text-xs font-medium tabular-nums active:scale-100 [&_svg]:size-3.5";

/**
 * Discord-style "N new messages" pill at the top of the thread, shown while the
 * NEW divider is scrolled out of view above. Same shape and size as
 * `ConversationScrollButton` (h-7, rounded-full, text-xs, 3.5 icons), filled
 * with the theme `primary` token so it matches the divider and the row dots.
 *
 * Owns its dismissed state: the parent keys it by the boundary id, so a new
 * boundary remounts it with `dismissed = false`.
 */
export function ChatNewMessagesPill({
  count,
  visible,
  onJump,
}: {
  count: number;
  /** The divider is above the viewport and not seen yet. */
  visible: boolean;
  /** Scroll the divider into view. The parent marks it seen. */
  onJump: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const label = count === 1 ? "1 new message" : `${count} new messages`;

  return (
    <div className="pointer-events-none absolute top-2 left-1/2 z-10 flex -translate-x-1/2 justify-center">
      <AnimatePresence>
        {visible && !dismissed ? (
          <m.div
            // Drops from, and lifts back toward, the top edge it points at:
            // the same path in both directions (mirror of the scroll button).
            initial={{ opacity: 0, y: -8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.94 }}
            transition={motionSpring}
            className="pointer-events-auto flex items-center"
          >
            <Button
              type="button"
              size="sm"
              onClick={onJump}
              className={cn(PILL_HALF, "gap-1.5 rounded-l-full rounded-r-none pr-1.5 pl-3")}
            >
              <IconArrowUp />
              {label}
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={() => setDismissed(true)}
              className={cn(PILL_HALF, "rounded-l-none rounded-r-full pr-2.5 pl-1.5")}
            >
              <IconX />
            </Button>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
