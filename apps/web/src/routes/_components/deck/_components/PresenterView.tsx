import type { KeyboardEvent } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button, cn } from "@eva/ui";
import type { DeckSlide } from "../slides/types";
import { getSpeakerNotes } from "../speakerNotes";
import { DeckStepContext, DeckThemeContext } from "./DeckPrimitives";
import { DECK_TONES } from "./deckTone";
import { DeckAmbient } from "./DeckAmbient";
import { STAGE_PERSPECTIVE } from "./DeckCamera";
import { DESIGN_H, DESIGN_W, useStageScale } from "./deckStage";
import {
  handleStepKey,
  isTypingTarget,
  useDeckNavigation,
} from "./deckNavigation";
import { deckSyncRef } from "./deckSyncRef";
import { postDeckMessage } from "./presenterSync";
import { PresenterClock } from "./PresenterClock";
import { PresenterNextUp, PresenterNotes } from "./PresenterNotes";

interface PresenterViewProps {
  slides: readonly DeckSlide[];
  slide: number;
  onNavigate: (slide: number) => void;
  /** The deck's own route path, e.g. "/slides/annual-cdm". Also the sync channel key. */
  basePath: string;
}

/**
 * The second screen: the live slide at its current build step on the left, the
 * script on the right. It drives the same navigation machine as the stage and
 * mirrors every move over `BroadcastChannel`, so either window can lead.
 */
export function PresenterView({
  slides,
  slide,
  onNavigate,
  basePath,
}: PresenterViewProps) {
  const nav = useDeckNavigation(slides, slide, onNavigate, (next, step) =>
    postDeckMessage({ deck: basePath, slide: next, step }),
  );
  const stage = useStageScale();
  const syncRef = deckSyncRef(basePath, nav.applyRemote);

  const { entry, step, total } = nav;
  const upcoming = slide < total ? slides[slide] : undefined;
  // The preview has to match the stage, including a light slide's surface.
  const theme = entry.theme ?? "dark";

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(event.target)) return;
    handleStepKey(event, nav);
  }

  return (
    <div
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      // The presenter window owns the keys, so it has to hold focus from the
      // first paint; the same callback attaches the two-window sync.
      ref={(el) => {
        if (!el) return;
        el.focus();
        return syncRef(el);
      }}
      className="fixed inset-0 flex bg-zinc-950 font-sans text-white outline-none select-none"
    >
      <div className="flex w-[58%] min-w-0 flex-col gap-5 p-6">
        <div
          ref={stage.measure}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        >
          <div
            style={{
              width: DESIGN_W,
              height: DESIGN_H,
              transform: `scale(${stage.scale})`,
              transformOrigin: "center",
              // Same viewing distance as the stage, so a camera shot reads
              // identically in the preview. The rounded clip below keeps this
              // element itself flat, which is fine: every camera carries its
              // own perspective, so nothing depends on it chaining deeper.
              perspective: STAGE_PERSPECTIVE,
              perspectiveOrigin: "50% 50%",
            }}
            // The frame sits on the canvas itself, so the border hugs the slide
            // rather than the letterboxed pane around it.
            className={cn(
              "relative shrink-0 overflow-hidden rounded-[20px] ring-2 ring-white/10",
              DECK_TONES[theme].stage,
            )}
          >
            <DeckAmbient theme={theme} />
            {/* Keyed on the slide id so a slide change remounts the build. */}
            <DeckThemeContext value={theme}>
              <DeckStepContext key={entry.id} value={step}>
                <entry.Component />
              </DeckStepContext>
            </DeckThemeContext>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <span className="font-mono text-sm tabular-nums text-white/40">
            {slide} / {total}
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-medium text-white/85">
            {entry.title}
          </span>
          {entry.steps > 0 && (
            <span className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1 font-mono text-xs tabular-nums text-white/55">
              step {step} of {entry.steps}
            </span>
          )}
          {/* `icon` not `icon-sm`: 40×40 each, and gap-2 keeps the two targets
              clear of one another. The Button variant already carries the
              house press (scale 0.96 on named properties). */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous"
              onClick={nav.prev}
              className="text-white/60 hover:bg-white/10 hover:text-white"
            >
              <IconChevronLeft />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next"
              onClick={nav.next}
              className="text-white/60 hover:bg-white/10 hover:text-white"
            >
              <IconChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex w-[42%] min-w-0 flex-col border-l border-white/10 bg-white/[0.02]">
        <div className="flex shrink-0 items-center justify-between gap-4 px-8 pt-7 pb-4">
          <h2 className="text-[11px] font-medium tracking-[0.22em] text-white/45 uppercase">
            Speaker notes
          </h2>
          <PresenterClock />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
          <PresenterNotes notes={getSpeakerNotes(entry.id)} />
          <PresenterNextUp title={upcoming?.title} number={slide + 1} />
        </div>
      </div>
    </div>
  );
}
