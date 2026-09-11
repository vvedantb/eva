import { useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionBase, motionFast } from "@eva/ui";
import { SLIDES } from "./slides/index";
import { SlideStepContext, SlideThemeContext } from "./_components/SlideShell";
import { SlideOutlinePanel } from "./_components/SlideOutlinePanel";

const DESIGN_W = 1280;
const DESIGN_H = 720;
const TOTAL = SLIDES.length;
const DEFAULT_STAGGER_MS = 1000;

interface SlideDeckProps {
  slide: number;
  onNavigate: (slide: number) => void;
  allowNavigation?: boolean;
  showOutline?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function SlideDeck({
  slide,
  onNavigate,
  allowNavigation = true,
  showOutline = true,
}: SlideDeckProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageAreaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const prevSlideRef = useRef(slide);
  const direction = slide >= prevSlideRef.current ? 1 : -1;
  const [step, setStep] = useState(0);

  const index = clamp(slide - 1, 0, TOTAL - 1);

  useSyncExternalStore(
    () => {
      prevSlideRef.current = slide;
      return () => {};
    },
    () => slide,
    () => slide,
  );

  useSyncExternalStore(
    () => {
      setStep(0);
      const entry = SLIDES[clamp(slide - 1, 0, TOTAL - 1)];
      if (entry.steps === 0) return () => {};
      const stagger = entry.staggerMs ?? DEFAULT_STAGGER_MS;
      const timers: number[] = [];
      for (let s = 1; s <= entry.steps; s++) {
        timers.push(window.setTimeout(() => setStep(s), stagger * s));
      }
      return () => timers.forEach((t) => window.clearTimeout(t));
    },
    () => slide,
    () => slide,
  );

  const go = (next: number, opts?: { delta?: number }) => {
    const delta = opts?.delta;
    const target =
      delta === 1
        ? clamp(slide + 1, 1, TOTAL)
        : delta === -1
          ? clamp(slide - 1, 1, TOTAL)
          : clamp(next, 1, TOTAL);
    if (target === slide) return;
    onNavigate(target);
  };

  useSyncExternalStore(
    () => {
      const el = stageAreaRef.current;
      if (!el) return () => {};

      function measure() {
        const node = stageAreaRef.current;
        if (!node) return;
        const { width, height } = node.getBoundingClientRect();
        setScale(Math.min(width / DESIGN_W, height / DESIGN_H));
      }
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    },
    () => scale,
    () => scale,
  );

  useSyncExternalStore(
    () => {
      if (!allowNavigation) return () => {};
      function onKey(e: KeyboardEvent) {
        switch (e.key) {
          case "ArrowRight":
          case " ":
          case "PageDown":
            e.preventDefault();
            go(0, { delta: 1 });
            break;
          case "ArrowLeft":
          case "PageUp":
            e.preventDefault();
            go(0, { delta: -1 });
            break;
          case "Home":
            e.preventDefault();
            go(1);
            break;
          case "End":
            e.preventDefault();
            go(TOTAL);
            break;
          case "f":
          case "F":
            if (!document.fullscreenElement) {
              containerRef.current?.requestFullscreen().catch(() => undefined);
            } else {
              document.exitFullscreen().catch(() => undefined);
            }
            break;
        }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    },
    () => `${slide}-${allowNavigation}`,
    () => `${slide}-${allowNavigation}`,
  );

  function handleStageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!allowNavigation) return;
    if (
      e.target instanceof Element &&
      e.target.closest('button, a, [role="button"]')
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;
    if (x < third) {
      go(0, { delta: -1 });
    } else if (x > third * 2) {
      go(0, { delta: 1 });
    }
  }

  const { Component, theme, id } = SLIDES[index];
  const showOrbs = id !== "00" && id !== "01";

  const variants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? 40 : -40,
    }),
    center: {
      opacity: 1,
      x: 0,
      transition: { duration: motionBase.duration, ease: motionBase.ease },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -24 : 24,
      transition: { duration: motionFast.duration, ease: motionFast.ease },
    }),
  };

  const progressPct = ((slide - 1) / Math.max(1, TOTAL - 1)) * 100;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex overflow-hidden bg-background"
    >
      <SlideOutlinePanel slide={slide} onNavigate={go} hidden={!showOutline} />

      <div
        ref={stageAreaRef}
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-background"
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
          className="relative shrink-0 cursor-pointer overflow-hidden rounded-lg"
          onClick={handleStageClick}
          role="presentation"
        >
          {showOrbs && (
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden
            >
              <motion.div
                className="absolute -left-44 -top-40 h-[560px] w-[560px] rounded-full bg-primary/5 blur-[110px]"
                animate={{ x: [0, 70, 0], y: [0, 50, 0] }}
                transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute -bottom-52 -right-40 h-[640px] w-[640px] rounded-full bg-primary/4 blur-[120px]"
                animate={{ x: [0, -80, 0], y: [0, -55, 0] }}
                transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute left-[52%] top-[58%] h-[380px] w-[380px] rounded-full bg-primary/3 blur-[100px]"
                animate={{ x: [0, 55, 0], y: [0, -65, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}

          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={slide}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              <SlideThemeContext value={theme}>
                <SlideStepContext value={step}>
                  <Component />
                </SlideStepContext>
              </SlideThemeContext>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-border">
          <div
            className="h-full bg-foreground/25 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs tabular-nums text-muted-foreground/60">
          {slide} / {TOTAL}
        </div>
      </div>
    </div>
  );
}
