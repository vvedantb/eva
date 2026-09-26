import { m } from "motion/react";
import { cn } from "@eva/ui";
import { useDeckStep, useMotionCue } from "../../_components/DeckPrimitives";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  cueTransition,
} from "../../_components/motion";

/** The lit run travels like a camera: long, decelerating, never bouncy. */
const TRAVEL = { duration: 1.2, ease: EASE.expo };

/** Static glow, painted once; only its position animates. */
const HEAD_GLOW = `radial-gradient(circle, #fff 0 2.5px, ${BRAND.blue}cc 3.5px, ${BRAND.purple}33 8px, transparent 13px)`;

/**
 * A progress rail. A faint track draws in on entry, then a lit run of brand
 * light travels along it to `stops[step]` (a 0–1 fraction), led by a small
 * glowing head. The run is revealed by two counter-translating layers, so the
 * gradient stays put under it and nothing but transform animates.
 */
export function MoA1Rail({
  width,
  left = 0,
  top = 0,
  stops,
  delay = 0,
  className,
}: {
  width: number;
  /** Position of the rail's left end and centre line, in pixels of the parent. */
  left?: number;
  top?: number;
  /** Fraction lit at each build step. The last entry holds. */
  stops: readonly number[];
  /** Seconds before the track draws in on slide entry. */
  delay?: number;
  className?: string;
}) {
  const step = useDeckStep();
  const lit = stops[Math.min(step, stops.length - 1)] ?? 0;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute h-0.5", className)}
      style={{ width, left, top: top - 1 }}
    >
      <m.div
        className="absolute inset-0 origin-left rounded-full bg-white/[0.12]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.3, ease: EASE.inOut, delay }}
      />
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <m.div
          className="absolute inset-0 overflow-hidden"
          initial={{ x: "-100%" }}
          animate={{ x: `${(lit - 1) * 100}%` }}
          transition={TRAVEL}
        >
          <m.div
            className="absolute inset-0 rounded-full"
            style={{ background: BRAND_GRADIENT }}
            initial={{ x: "100%" }}
            animate={{ x: `${(1 - lit) * 100}%` }}
            transition={TRAVEL}
          />
        </m.div>
      </div>
      <m.span
        className="absolute top-1/2 left-0 size-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: HEAD_GLOW }}
        initial={{ x: 0, opacity: 0 }}
        animate={{ x: lit * width, opacity: lit > 0 ? 1 : 0 }}
        transition={{ ...TRAVEL, opacity: { duration: DUR.base } }}
      />
    </div>
  );
}

/**
 * A brand dot that lands on its cue: it pops to size on a tween (no spring
 * keyframes) while one ring spreads from it and fades. The ring is one-shot, so
 * it costs nothing once the step has settled.
 */
export function MoA1Dot({
  step,
  delay = 0,
  size = 14,
  liveStep,
  className,
}: {
  step?: number;
  delay?: number;
  size?: number;
  /** From this step on, one slow ring keeps breathing out: "still live". */
  liveStep?: number;
  className?: string;
}) {
  const { on, delay: start } = useMotionCue(step, delay);
  const live = useDeckStep() >= (liveStep ?? Infinity);

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <m.span
        className="absolute inset-0 rounded-full"
        style={{ border: `1.5px solid ${BRAND.purple}` }}
        initial={{ scale: 1, opacity: 0 }}
        animate={
          on ? { scale: [1, 3.4], opacity: [0.8, 0] } : { scale: 1, opacity: 0 }
        }
        transition={
          on
            ? { duration: 1.1, ease: EASE.out, delay: start + 0.12 }
            : { duration: 0 }
        }
      />
      {live && (
        <m.span
          className="absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${BRAND.blue}` }}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
          transition={{
            duration: 2.4,
            ease: "easeOut",
            repeat: Infinity,
            delay: 0.6,
          }}
        />
      )}
      <m.span
        className="absolute inset-0 rounded-full shadow-[0_0_18px_rgba(139,63,184,0.6)]"
        style={{
          background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ scale: 0 }}
        animate={on ? { scale: [0, 1.3, 1] } : { scale: 0 }}
        transition={cueTransition(on, start, {
          duration: DUR.slow,
          ease: EASE.out,
          times: [0, 0.55, 1],
        })}
      />
    </span>
  );
}
