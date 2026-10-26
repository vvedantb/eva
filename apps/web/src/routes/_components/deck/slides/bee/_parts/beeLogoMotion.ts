// Ported from the Bee app (`src/renderer/src/logo.ts`): pure helpers for BeeLogo.

/** Which parts of the mark to draw at a given pixel size. Below 24 px fine detail turns to mush, so it is dropped. */
export type LogoDetail = {
  /** The tiny view crops the empty glow margin so the orb fills more pixels. */
  viewBox: string;
  glow: boolean;
  antennae: boolean;
  catchlights: boolean;
  grain: boolean;
};

export const LOGO_TINY_BELOW = 24;

export function logoDetail(size: number): LogoDetail {
  if (size < LOGO_TINY_BELOW)
    return {
      viewBox: "7 7 50 50",
      glow: false,
      antennae: false,
      catchlights: false,
      grain: false,
    };
  return {
    viewBox: "0 0 64 64",
    glow: true,
    antennae: true,
    catchlights: size >= 32,
    grain: size >= 48,
  };
}

/** Blink every 3–5 s, with a per-instance phase, so logos on one screen do not blink in step. */
export function blinkTiming(seed: string): { periodS: number; delayS: number } {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const periodS = 3 + (hash % 1000) / 500;
  const delayS = (((hash >>> 10) % 1000) / 1000) * periodS;
  return {
    periodS: Math.round(periodS * 100) / 100,
    delayS: Math.round(delayS * 100) / 100,
  };
}

/** What the mark shows. The slides pick one per step. */
export type LogoState =
  | "idle"
  | "listening"
  | "thinking"
  | "searching"
  | "tool"
  | "done"
  | "error";

/**
 * Sizes for the state extras (rings, orbit, figure-8, loop) in view-box units, so they stay inside the view. The ring is
 * centred on the orb (32, 35), so its largest size must fit the 29 units below it.
 * The tiny view is widened a little when animated (the static mark keeps its crop), and its paths are smaller to fit it.
 */
export type LogoMotion = {
  viewBox: string;
  ringR: number;
  /** Ring growth at full mic level, and the echo ring's end scale. */
  ringGain: number;
  echoScale: number;
  eightX: number;
  eightY: number;
  orbitX: number;
  loopR: number;
  /** Where the larger done sparkle sits. */
  sparkAt: { x: number; y: number; scale: number };
};

export function logoMotion(size: number): LogoMotion {
  if (size < LOGO_TINY_BELOW) {
    return {
      viewBox: "5 5 54 54",
      ringR: 22,
      ringGain: 0.09,
      echoScale: 1.09,
      eightX: 8,
      eightY: 3.5,
      orbitX: 24,
      loopR: 3,
      sparkAt: { x: 54, y: 22, scale: 0.8 },
    };
  }
  return {
    viewBox: "0 0 64 64",
    ringR: 22,
    ringGain: 0.3,
    echoScale: 1.3,
    eightX: 11,
    eightY: 4.5,
    orbitX: 26,
    loopR: 7,
    sparkAt: { x: 57, y: 24, scale: 1 },
  };
}

// Paths are easier to state as maths than as hand-written keyframes. Amplitudes come from LogoMotion via CSS variables
// (--eight-x, --eight-y, --orbit-x, --loop-r) set on the svg, so one set of keyframes serves every size.
export const EIGHT = { periodS: 3.2, dots: 8, lagS: 0.17, rest: 0.12 };
export const ORBIT = { periodS: 1.8, ry: 8, dy: 1 };
// The loop takes the first 36 % of the 3 s done cycle; the sparkle is gone by 62 %.
const LOOP_END = 36;
const TAU = Math.PI * 2;
const ORBIT_LAYERS: ("front" | "back")[] = ["front", "back"];

const num = (value: number) => `${+value.toFixed(3)}`;
const range = (steps: number) =>
  Array.from({ length: steps + 1 }, (_, i) => i / steps);
const declarations = (pose: Record<string, string>) =>
  Object.entries(pose)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
const keyframes = (name: string, stops: [number, Record<string, string>][]) =>
  `@keyframes ${name}{${stops.map(([at, pose]) => `${+at.toFixed(2)}%{${declarations(pose)}}`).join("")}}`;

/** Figure-8 around the resting point, `turn` in 0..1. */
export function eightAt(turn: number): { translate: string } {
  const a = turn * TAU;
  return {
    translate: `calc(var(--eight-x) * ${num(Math.sin(a))}) calc(var(--eight-y) * ${num(Math.sin(2 * a))})`,
  };
}

/** Tilted orbit; the near half (below) draws in front of the orb, the far half behind it. */
export function orbitAt(
  turn: number,
  layer: "front" | "back",
): { translate: string; scale: string; opacity: string } {
  const a = turn * TAU;
  const depth = Math.sin(a);
  const front = Math.min(1, Math.max(0, 0.5 + depth * 3));
  return {
    translate: `calc(var(--orbit-x) * ${num(Math.cos(a))}) ${num(ORBIT.ry * depth + ORBIT.dy)}px`,
    scale: num(0.8 + 0.25 * depth),
    opacity: num(layer === "front" ? front : (1 - front) * 0.5),
  };
}

function loopAt(turn: number): { translate: string } {
  const a = turn * TAU;
  return {
    translate: `calc(var(--loop-r) * ${num(Math.sin(a))}) calc(var(--loop-r) * ${num(-(1 - Math.cos(a)))})`,
  };
}

/** Turn offset of trail dot `k` (1-based) behind the bee on the figure-8. */
export const trailTurn = (k: number) =>
  EIGHT.rest - (k * EIGHT.lagS) / EIGHT.periodS;

/** Keyframes for the generated paths. BeeLogo hoists them once per document. */
export function logoMotionCss(): string {
  const wings = (deg: number) => ({
    transform: `rotate(calc(var(--flap) * ${deg}deg))`,
  });
  return [
    keyframes(
      "bee-eight",
      range(32).map((t) => [t * 100, eightAt(t)]),
    ),
    // Searching's still pose (reduced motion), a little along the path.
    `.bee-logo[data-state="searching"] .bee-flight{${declarations(eightAt(EIGHT.rest))}}`,
    ...ORBIT_LAYERS.map((layer) =>
      keyframes(
        `bee-orbit-${layer}`,
        range(24).map((t) => [t * 100, orbitAt(t, layer)]),
      ),
    ),
    keyframes("bee-loop", [
      ...range(12).map((t): [number, Record<string, string>] => [
        t * LOOP_END,
        loopAt(t),
      ]),
      [LOOP_END + 6, { translate: "0 1.4px" }],
      [LOOP_END + 13, { translate: "0 -0.4px" }],
      [LOOP_END + 19, { translate: "0 0" }],
      [100, { translate: "0 0" }],
    ]),
    keyframes("bee-loop-spin", [
      [0, { rotate: "0deg" }],
      [LOOP_END, { rotate: "-360deg" }],
      [100, { rotate: "-360deg" }],
    ]),
    keyframes("bee-done-wings", [
      ...range(8).map((t, i): [number, Record<string, string>] => [
        t * LOOP_END,
        wings(i % 2 ? 18 : -4),
      ]),
      [LOOP_END + 6, wings(0)],
      [100, wings(0)],
    ]),
  ].join("\n");
}
