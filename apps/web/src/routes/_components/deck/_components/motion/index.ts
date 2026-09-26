/**
 * The deck's motion kit. Read `README.md` in this folder before using it.
 *
 * Every primitive is step-aware: pass `step` to play on a build step, or omit
 * it to follow the enclosing `Reveal`/`Stagger` (their step and delay).
 */
export {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  EASE_OUT,
  HERO,
  LEAVE,
  SETTLE,
  STAGGER,
  cueTransition,
} from "./tokens";
export { useMotionCue } from "../deckContext";
export type { MotionCue } from "../deckContext";

export { MaskedText } from "./MaskedText";
export type { MaskedTextProps } from "./MaskedText";
export { SplitReveal } from "./SplitReveal";
export type { SplitRevealProps } from "./SplitReveal";
export { DrawPath } from "./DrawPath";
export type { DrawPathProps } from "./DrawPath";
export { Sheen } from "./Sheen";
export type { SheenProps } from "./Sheen";
export { Spotlight } from "./Spotlight";
export type { SpotlightProps, SpotlightShot } from "./Spotlight";
export { GridBackdrop } from "./GridBackdrop";
export type { GridBackdropProps } from "./GridBackdrop";
export { Connector } from "./Connector";
export type { ConnectorProps, Point } from "./Connector";
export { Marquee, Ticker } from "./Ticker";
export type { TickerProps } from "./Ticker";
export { Pulse } from "./Pulse";
export type { PulseProps } from "./Pulse";
export { Morph } from "./Morph";
export type { MorphProps } from "./Morph";
export { Magnify } from "./Magnify";
export type { MagnifyProps } from "./Magnify";
export { CountRoll } from "./CountRoll";
