"use client";

import { IconRefresh } from "@tabler/icons-react";
import { CrossfadeIcon } from "./crossfade-icon";
import { CircleSpinner } from "./spinner";
import { cn } from "../utils/cn";

/**
 * Refresh glyph for a control that reloads something: it crossfades to
 * {@link CircleSpinner} while the action is in flight.
 *
 * Centralised because eight toolbars had each grown the same `IconRefresh` +
 * `animate-spin` pair — a grey generic circle rather than the brand spinner,
 * with a different size guess at every call site. The `soft` crossfade matches
 * the preview nav bar, which already swapped glyph for spinner this way.
 *
 * `className` sizes the slot and both glyphs. Inside a `Button`, the button's
 * `[&_svg]:size-*` rule wins on specificity, so pass a matching size to keep
 * the slot and the glyph the same box.
 */
function RefreshSpinIcon({
  busy,
  className = "size-4",
}: {
  busy: boolean;
  className?: string;
}) {
  return (
    <CrossfadeIcon
      show={busy}
      trueKey="busy"
      falseKey="idle"
      variant="soft"
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      whenTrue={<CircleSpinner size="sm" className={className} />}
      whenFalse={<IconRefresh className={className} />}
    />
  );
}

export { RefreshSpinIcon };
