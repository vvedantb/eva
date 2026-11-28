import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@eva/ui";
import type { DeckSlide } from "./slides/types";
import { DeckStepContext } from "./_components/deckContext";
import { DeckThemeScope } from "./_components/DeckThemeScope";
import { EASE } from "./_components/motion/tokens";
import { DeckAmbient } from "./_components/DeckAmbient";
import { STAGE_PERSPECTIVE } from "./_components/DeckCamera";
import { DeckChrome } from "./_components/DeckChrome";
import { DeckOutline } from "./_components/DeckOutline";
import {
  BRAND_CLASS,
  BRAND_STAGE,
  DECK_TONES,
  SECTION_CLASS,
} from "./_components/deckTone";
import type { DeckBrand } from "./_components/deckTone";
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
  sessionCode: string | undefined;
  updateSearch: (next: {
    slide?: number;
    session?: string | undefined;
  }) => void;
  basePath: string;
  brand?: DeckBrand;
}

interface SlideMotion {
  dir: number;
  morph: boolean;
}

const MORPH_FADE = { opacity: 0, x: 0, rotateY: 0, z: 0, scale: 1 };

const slideVariants = {
  enter: ({ dir, morph }: SlideMotion) =>
    morph
      ? MORPH_FADE
      : {
          opacity: 0,
          x: dir * 60,
          rotateY: dir * 10,
          z: -320,
          scale: 0.97,
        },
  center: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    z: 0,
    scale: 1,
    transition: {
      duration: 0.78,
      ease: EASE.expo,
      opacity: { duration: 0.4, ease: EASE.out, delay: 0.06 },
    },
  },
  exit: ({ dir, morph }: SlideMotion) =>
    morph
      ? { ...MORPH_FADE, transition: { duration: 0.45, ease: EASE.out } }
      : {
          opacity: 0,
          x: dir * -40,
          rotateY: dir * -6,
          z: -160,
          scale: 0.985,
          transition: { duration: 0.34, ease: EASE.in },
        },
};

const AUTO_FIRST_MS = 1100;
const AUTO_STEP_MS = 1500;

export function Deck({
  slides,
  slide,
  sessionCode,
  updateSearch,
  basePath,
  brand = "eva",
}: DeckProps) {
  const share = useLiveShare({ slide, sessionCode, updateSearch });
  const nav = useDeckNavigation(
    slides,
    share.effectiveSlide,
    share.onNavigate,
    (next, step) => postDeckMessage({ deck: basePath, slide: next, step }),
  );
  const { scale: stageScale, measure: measureStage } = useStageScale();
  const syncRef = deckSyncRef(basePath, nav.applyRemote);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [autoBuild, setAutoBuild] = useState(true);

  const { entry, step, direction, total } = nav;
  const theme = entry.theme ?? "dark";
  const index = slides.indexOf(entry);
  const slideMotion: SlideMotion = {
    dir: direction,
    morph: Boolean(direction > 0 ? entry.morph : slides[index + 1]?.morph),
  };

  const presenterNav: DeckNavigation = autoBuild
    ? {
        ...nav,
        next: () => nav.goTo(share.effectiveSlide + 1),
        prev: nav.prevSlide,
      }
    : nav;
  const driven: DeckNavigation = share.isFollower
    ? { ...nav, next: noop, prev: noop, prevSlide: noop, goTo: noop }
    : presenterNav;

  const autoNext =
    autoBuild &&
    !share.isFollower &&
    (direction > 0 || step === 0) &&
    step < entry.steps;
  const advance = nav.next;
  useEffect(() => {
    if (!autoNext) return;
    const wait =
      entry.autoMs?.[step] ?? (step === 0 ? AUTO_FIRST_MS : AUTO_STEP_MS);
    const timer = setTimeout(advance, wait);
    return () => clearTimeout(timer);
  }, [autoNext, advance, step, entry]);

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
      case "a":
        event.preventDefault();
        setAutoBuild((on) => !on);
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
    <div
      tabIndex={-1}
      autoFocus
      ref={(el) => {
        if (!el) return;
        el.focus();
        return syncRef(el);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "fixed inset-0 flex overflow-hidden font-sans outline-none transition-colors duration-500 select-none",
        DECK_TONES[theme].stage,
        BRAND_CLASS[brand],
        BRAND_STAGE[brand],
        entry.section && SECTION_CLASS[entry.section],
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
        ref={measureStage}
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${stageScale})`,
            transformOrigin: "center",
            perspective: STAGE_PERSPECTIVE,
            perspectiveOrigin: "50% 50%",
            transformStyle: "preserve-3d",
          }}
          className="relative shrink-0"
        >
          <AnimatePresence mode="popLayout" custom={slideMotion}>
            <m.div
              key={share.effectiveSlide}
              custom={slideMotion}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              <DeckThemeScope theme={theme}>
                <DeckStepContext value={step}>
                  <entry.Component />
                </DeckStepContext>
              </DeckThemeScope>
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
