import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { SLIDES } from "./slides/index";
import { DeckStepContext, EASE_OUT } from "./_components/DeckPrimitives";
import { DeckAmbient } from "./_components/DeckAmbient";
import { DeckChrome } from "./_components/DeckChrome";
import { DeckOutline } from "./_components/DeckOutline";

const DESIGN_W = 1280;
const DESIGN_H = 720;
const TOTAL = SLIDES.length;

interface UpdatesDeckProps {
  slide: number;
  onNavigate: (slide: number) => void;
}

/**
 * Where the build is up to, plus which slide that build belongs to and which
 * way we travelled to get there. Keeping all three in one state object is what
 * lets an external slide change (URL, outline click, browser back) implicitly
 * reset the build to step 0 without an effect.
 */
interface DeckState {
  slide: number;
  step: number;
  direction: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

const slideVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir * 48,
    scale: 0.985,
    filter: "blur(8px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: EASE_OUT },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -32,
    scale: 0.99,
    filter: "blur(6px)",
    transition: { duration: 0.3, ease: EASE_OUT },
  }),
};

export function UpdatesDeck({ slide, onNavigate }: UpdatesDeckProps) {
  const [deckState, setDeckState] = useState<DeckState>({
    slide,
    step: 0,
    direction: 1,
  });
  const [scale, setScale] = useState(1);
  const [outlineOpen, setOutlineOpen] = useState(false);

  const onCurrentSlide = deckState.slide === slide;
  const step = onCurrentSlide ? deckState.step : 0;
  const direction = onCurrentSlide
    ? deckState.direction
    : slide >= deckState.slide
      ? 1
      : -1;

  const index = clamp(slide - 1, 0, TOTAL - 1);
  const entry = SLIDES[index];

  function goTo(target: number) {
    const destination = clamp(target, 1, TOTAL);
    if (destination === slide) return;
    setDeckState({
      slide: destination,
      step: 0,
      direction: destination >= slide ? 1 : -1,
    });
    onNavigate(destination);
  }

  function next() {
    if (step < entry.steps) {
      setDeckState({ slide, step: step + 1, direction });
      return;
    }
    if (slide < TOTAL) goTo(slide + 1);
  }

  function prev() {
    if (step > 0) {
      setDeckState({ slide, step: step - 1, direction });
      return;
    }
    if (slide <= 1) return;
    // Step back onto the *finished* previous slide rather than replaying its build.
    setDeckState({
      slide: slide - 1,
      step: SLIDES[slide - 2].steps,
      direction: -1,
    });
    onNavigate(slide - 1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(event.target)) return;
    const root = event.currentTarget;

    switch (event.key) {
      case "ArrowRight":
      case " ":
      case "PageDown":
      case "j":
        event.preventDefault();
        next();
        return;
      case "ArrowLeft":
      case "PageUp":
      case "k":
        event.preventDefault();
        prev();
        return;
      case "Home":
        event.preventDefault();
        goTo(1);
        return;
      case "End":
        event.preventDefault();
        goTo(TOTAL);
        return;
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
    if (event.clientX - rect.left < rect.width * 0.25) prev();
    else next();
  }

  return (
    // The deck root is the keyboard surface for the whole presentation, which is
    // why it is focusable and owns the key handler rather than a window listener.
    <div
      tabIndex={-1}
      autoFocus
      // The deck owns the keys, so it has to hold focus from the first paint —
      // `autoFocus` alone does not land on a non-form host element.
      ref={(el) => {
        el?.focus();
      }}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 flex overflow-hidden bg-zinc-950 font-sans text-white outline-none select-none"
    >
      <DeckAmbient />

      <DeckOutline
        open={outlineOpen}
        slide={slide}
        onNavigate={goTo}
        onClose={() => setOutlineOpen(false)}
      />

      <div
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
        onClick={handleStageClick}
        role="presentation"
        ref={(el) => {
          if (!el) return;
          const measure = () => {
            const { width, height } = el.getBoundingClientRect();
            if (width === 0 || height === 0) return;
            setScale(Math.min(width / DESIGN_W, height / DESIGN_H));
          };
          measure();
          const observer = new ResizeObserver(measure);
          observer.observe(el);
          return () => observer.disconnect();
        }}
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            transformOrigin: "center",
          }}
          className="relative shrink-0"
        >
          {/* No `initial={false}`: it propagates to every descendant and would
              freeze mount-time animations on a direct `?slide=n` load. */}
          <AnimatePresence mode="popLayout" custom={direction}>
            <m.div
              key={slide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              <DeckStepContext value={step}>
                <entry.Component />
              </DeckStepContext>
            </m.div>
          </AnimatePresence>
        </div>

        <DeckChrome
          slide={slide}
          total={TOTAL}
          onToggleOutline={() => setOutlineOpen((open) => !open)}
        />
      </div>
    </div>
  );
}
