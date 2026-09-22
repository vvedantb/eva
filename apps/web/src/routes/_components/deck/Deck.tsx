import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import type { DeckSlide } from "./slides/types";
import {
  DeckStepContext,
  DeckThemeContext,
  EASE_OUT,
} from "./_components/DeckPrimitives";
import { DeckAmbient } from "./_components/DeckAmbient";
import { STAGE_PERSPECTIVE } from "./_components/DeckCamera";
import { DeckChrome } from "./_components/DeckChrome";
import { DeckOutline } from "./_components/DeckOutline";
import { DECK_TONES } from "./_components/deckTone";
import { DESIGN_H, DESIGN_W, useStageScale } from "./_components/deckStage";
import {
  handleStepKey,
  isTypingTarget,
  useDeckNavigation,
} from "./_components/deckNavigation";
import type { DeckNavigation } from "./_components/deckNavigation";
import { deckSyncRef } from "./_components/deckSyncRef";
import {
  openPresenterWindow,
  postDeckMessage,
} from "./_components/presenterSync";
import { useLiveShare } from "./_components/useLiveShare";

interface DeckProps {
  slides: readonly DeckSlide[];
  slide: number;
  /** Present when this window is hosting or following a live session. */
  sessionCode: string | undefined;
  /** Writes `slide` and `session` back into the route's search params. */
  updateSearch: (next: {
    slide?: number;
    session?: string | undefined;
  }) => void;
  /** The deck's own route path, e.g. "/slides/annual-cdm". Also the sync channel key. */
  basePath: string;
}

/**
 * Slides arrive out of depth rather than sliding across. No animated `filter`:
 * blurring a full-screen layer every frame is the expensive path, and the push
 * in Z carries the same "this replaces that" reading for free.
 */
const slideVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    rotateY: dir * 12,
    z: -220,
  }),
  center: {
    opacity: 1,
    rotateY: 0,
    z: 0,
    transition: { duration: 0.55, ease: EASE_OUT },
  },
  exit: (dir: number) => ({
    opacity: 0,
    rotateY: dir * -8,
    z: -120,
    transition: { duration: 0.3, ease: EASE_OUT },
  }),
};

export function Deck({
  slides,
  slide,
  sessionCode,
  updateSearch,
  basePath,
}: DeckProps) {
  const share = useLiveShare({ slide, sessionCode, updateSearch });
  // The stage renders the host's slide when following, its own otherwise, so
  // everything below — build steps, direction, the outline — follows from it.
  const nav = useDeckNavigation(
    slides,
    share.effectiveSlide,
    share.onNavigate,
    (next, step) => postDeckMessage({ deck: basePath, slide: next, step }),
  );
  const stage = useStageScale();
  const syncRef = deckSyncRef(basePath, nav.applyRemote);
  const [outlineOpen, setOutlineOpen] = useState(false);

  const { entry, step, direction, total } = nav;
  const theme = entry.theme ?? "dark";

  // A follower is a passenger: every way of moving the deck by hand is taken
  // away in one place, rather than guarded at each call site. `applyRemote` is
  // untouched, so a host's own presenter window still drives this stage.
  const driven: DeckNavigation = share.isFollower
    ? { ...nav, next: noop, prev: noop, goTo: noop }
    : nav;

  function openPresenter() {
    openPresenterWindow(basePath, share.effectiveSlide);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(event.target)) return;
    if (handleStepKey(event, driven)) return;
    const root = event.currentTarget;

    switch (event.key) {
      case "f":
        event.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => undefined);
        } else {
          root.requestFullscreen().catch(() => undefined);
        }
        return;
      case "o":
        event.preventDefault();
        setOutlineOpen((open) => !open);
        return;
      case "p":
        event.preventDefault();
        openPresenter();
        return;
      case "Escape":
        if (!outlineOpen) return;
        event.preventDefault();
        setOutlineOpen(false);
        return;
      default:
        return;
    }
  }

  function handleStageClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest('button, a, [role="button"]')
    ) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width * 0.25) driven.prev();
    else driven.next();
  }

  return (
    // The deck root is the keyboard surface for the whole presentation, which is
    // why it is focusable and owns the key handler rather than a window listener.
    <div
      tabIndex={-1}
      autoFocus
      // The deck owns the keys, so it has to hold focus from the first paint —
      // `autoFocus` alone does not land on a non-form host element. The same
      // callback attaches the presenter-window sync and restores the host role
      // after a reload, keeping `localStorage` out of render.
      ref={(el) => {
        if (!el) return;
        el.focus();
        share.restoreHost();
        return syncRef(el);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "fixed inset-0 flex overflow-hidden font-sans outline-none transition-colors duration-500 select-none",
        DECK_TONES[theme].stage,
      )}
    >
      <DeckAmbient theme={theme} />

      <DeckOutline
        slides={slides}
        open={outlineOpen}
        slide={share.effectiveSlide}
        onNavigate={driven.goTo}
        onClose={() => setOutlineOpen(false)}
      />

      <div
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
        onClick={handleStageClick}
        role="presentation"
        ref={stage.measure}
      >
        {/* The canvas owns both the fit-to-pane scale and the viewing distance,
            so the slide layers directly inside it can move in depth. Nothing
            here clips its overflow: that would flatten the 3D context. */}
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${stage.scale})`,
            transformOrigin: "center",
            perspective: STAGE_PERSPECTIVE,
            perspectiveOrigin: "50% 50%",
            transformStyle: "preserve-3d",
          }}
          className="relative shrink-0"
        >
          {/* No `initial={false}`: it propagates to every descendant and would
              freeze mount-time animations on a direct `?slide=n` load. */}
          <AnimatePresence mode="popLayout" custom={direction}>
            <m.div
              key={share.effectiveSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              <DeckThemeContext value={theme}>
                <DeckStepContext value={step}>
                  <entry.Component />
                </DeckStepContext>
              </DeckThemeContext>
            </m.div>
          </AnimatePresence>
        </div>

        <DeckChrome
          slide={share.effectiveSlide}
          total={total}
          theme={theme}
          share={share}
          basePath={basePath}
          onToggleOutline={() => setOutlineOpen((open) => !open)}
          onOpenPresenter={openPresenter}
        />
      </div>
    </div>
  );
}

function noop() {
  return undefined;
}
