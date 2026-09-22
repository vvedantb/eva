import { m } from "motion/react";
import { BRAND } from "./DeckPrimitives";
import type { DeckTheme } from "./DeckPrimitives";

/**
 * The deck's persistent backdrop: two slow brand-coloured orbs, a faint dot
 * grid and a vignette. It lives outside `AnimatePresence` so it drifts
 * continuously rather than restarting on every slide change.
 *
 * The same backdrop has to read on a light slide, so the orbs sit back, the
 * grid dots invert and the vignette closes to white instead of black.
 */

interface AmbientTone {
  purpleOpacity: number;
  blueOpacity: number;
  dot: string;
  vignette: string;
}

const TONES: Record<DeckTheme, AmbientTone> = {
  dark: {
    purpleOpacity: 0.16,
    blueOpacity: 0.13,
    dot: "rgba(255,255,255,0.06)",
    vignette: "rgba(0,0,0,0.55)",
  },
  light: {
    purpleOpacity: 0.1,
    blueOpacity: 0.08,
    dot: "rgba(9,9,11,0.07)",
    vignette: "rgba(255,255,255,0.6)",
  },
};

export function DeckAmbient({ theme = "dark" }: { theme?: DeckTheme }) {
  const tone = TONES[theme];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <m.div
        className="absolute size-[680px] rounded-full blur-[120px]"
        style={{
          background: BRAND.purple,
          top: "-12%",
          left: "-8%",
        }}
        animate={{
          x: [0, 160, -60, 0],
          y: [0, 90, 180, 0],
          opacity: tone.purpleOpacity,
        }}
        transition={{
          x: { duration: 28, ease: "easeInOut", repeat: Infinity },
          y: { duration: 28, ease: "easeInOut", repeat: Infinity },
          opacity: { duration: 0.5 },
        }}
      />
      <m.div
        className="absolute size-[620px] rounded-full blur-[120px]"
        style={{
          background: BRAND.blue,
          bottom: "-16%",
          right: "-6%",
        }}
        animate={{
          x: [0, -140, 70, 0],
          y: [0, -110, -40, 0],
          opacity: tone.blueOpacity,
        }}
        transition={{
          x: { duration: 32, ease: "easeInOut", repeat: Infinity },
          y: { duration: 32, ease: "easeInOut", repeat: Infinity },
          opacity: { duration: 0.5 },
        }}
      />

      <div
        className="absolute inset-0 bg-[size:28px_28px]"
        style={{
          backgroundImage: `radial-gradient(${tone.dot} 1px, transparent 1px)`,
          maskImage:
            "radial-gradient(ellipse at center, black 0%, transparent 70%)",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 55%, ${tone.vignette})`,
        }}
      />
    </div>
  );
}
