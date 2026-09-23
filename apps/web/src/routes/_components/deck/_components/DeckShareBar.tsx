import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  IconCheck,
  IconCopy,
  IconPlayerStop,
  IconUsers,
} from "@tabler/icons-react";
import { cn, motionFast, motionSpring } from "@eva/ui";
import type { DeckTheme } from "./DeckPrimitives";
import { DECK_TONES } from "./deckTone";
import type { LiveShare } from "./useLiveShare";

interface DeckShareBarProps {
  share: LiveShare;
  /** The deck's own route path, used to build the join link. */
  basePath: string;
  theme: DeckTheme;
}

/**
 * The bar the presenter and the viewers see while a deck is shared live. It is
 * deliberately small and bottom-centred: it has to survive a projector without
 * competing with the slide.
 */
export function DeckShareBar({ share, basePath, theme }: DeckShareBarProps) {
  const code = share.sessionCode;
  const live = share.sessionState !== "none" && code !== undefined;

  return (
    <AnimatePresence>
      {live && code !== undefined && (
        <SharePanel
          key="deck-share-bar"
          share={share}
          basePath={basePath}
          theme={theme}
          code={code}
        />
      )}
    </AnimatePresence>
  );
}

function SharePanel({
  share,
  basePath,
  theme,
  code,
}: DeckShareBarProps & { code: string }) {
  const [copied, setCopied] = useState(false);
  const tone = DECK_TONES[theme];

  function copyLink() {
    const url = `${window.location.origin}${basePath}?session=${code}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  // The pill stays visually small — `hit-target` grows the pressable area to
  // 40×40 with a pseudo-element instead. `gap-5` is what keeps two of those
  // grown areas (8px of bleed each) from meeting in the middle.
  const action = cn(
    "hit-target inline-flex items-center rounded-full px-3 py-1 text-xs",
    "motion-press active:scale-[0.96]",
    tone.surface,
    tone.text,
  );

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      // A smaller, faster departure than the arrival — the bar should not draw
      // the room's eye on its way out.
      exit={{ opacity: 0, y: 4, transition: motionFast }}
      transition={motionSpring}
      className={cn(
        // Concentric: the bar and its buttons are both pills, so the outer
        // radius is the inner radius plus the 8px of padding by construction.
        "pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-5 rounded-full px-4 py-2 text-xs backdrop-blur-md",
        tone.surface,
        tone.muted,
      )}
    >
      {share.isHost ? (
        <>
          <LiveDot />
          <span
            className={cn("font-mono tracking-widest tabular-nums", tone.text)}
          >
            {code}
          </span>
          <button type="button" onClick={copyLink} className={action}>
            {copied ? (
              <span className="inline-flex items-center gap-1.5">
                <IconCheck size={13} /> Copied
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <IconCopy size={13} /> Copy link
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => void share.stopSharing()}
            className={action}
          >
            <span className="inline-flex items-center gap-1.5">
              <IconPlayerStop size={13} /> Stop sharing
            </span>
          </button>
        </>
      ) : (
        <>
          <IconUsers size={14} className={tone.muted} />
          <span className={tone.text}>{followerLabel(share.sessionState)}</span>
          <span
            className={cn("font-mono tracking-widest tabular-nums", tone.muted)}
          >
            {code}
          </span>
          <button type="button" onClick={share.leave} className={action}>
            Leave
          </button>
        </>
      )}
    </m.div>
  );
}

function followerLabel(state: LiveShare["sessionState"]): string {
  switch (state) {
    case "loading":
      return "Connecting to the presenter";
    case "ended":
      return "The presentation has ended";
    case "notfound":
      return "Presentation not found";
    default:
      return "Following the presenter";
  }
}

/** A pulsing red dot: the one place the deck borrows broadcast language. */
function LiveDot() {
  return (
    <span className="relative flex size-2 shrink-0">
      <m.span
        className="absolute inline-flex size-full rounded-full bg-red-500"
        animate={{ opacity: [0.7, 0, 0.7], scale: [1, 2.2, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative inline-flex size-2 rounded-full bg-red-500" />
    </span>
  );
}
