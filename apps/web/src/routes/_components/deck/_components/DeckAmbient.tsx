import { m } from "motion/react";
import { BRAND } from "./motion/tokens";
import type { DeckTheme } from "./deckContext";

/**
 * The deck's persistent backdrop: a slow mesh of brand light, a faint dot
 * grid, fixed film grain and a vignette. It lives outside `AnimatePresence`
 * so it drifts continuously rather than restarting on every slide change.
 *
 * Cost: three transformed layers on 38–58 s loops and nothing else. The blobs
 * are radial gradients, soft by construction, so there is no blur filter to
 * re-rasterise; the grain is an SVG noise tile painted once and never moved.
 *
 * A light slide gets the same scene turned well down: fainter light, darker
 * grain at lower strength, and a vignette that closes to white.
 */

interface AmbientTone {
  mesh: readonly [number, number, number];
  grain: string;
  grainOpacity: number;
  dot: string;
  vignette: string;
}

const TONES: Record<DeckTheme, AmbientTone> = {
  dark: {
    mesh: [0.3, 0.26, 0.16],
    grain: "255 255 255",
    grainOpacity: 0.05,
    dot: "rgba(255,255,255,0.05)",
    vignette: "rgba(0,0,0,0.6)",
  },
  light: {
    mesh: [0.1, 0.08, 0.06],
    grain: "0 0 0",
    grainOpacity: 0.035,
    dot: "rgba(9,9,11,0.06)",
    vignette: "rgba(255,255,255,0.6)",
  },
};

interface Blob {
  color: string;
  size: number;
  at: { top?: string; left?: string; right?: string; bottom?: string };
  x: number[];
  y: number[];
  scale: number[];
  period: number;
}

/** A third, in-between hue keeps the mesh from reading as two spotlights. */
const INDIGO = "#5A5FD0";

const BLOBS: readonly Blob[] = [
  {
    color: BRAND.purple,
    size: 900,
    at: { top: "-30%", left: "-20%" },
    x: [0, 180, 60, 0],
    y: [0, 120, 220, 0],
    scale: [1, 1.12, 0.94, 1],
    period: 38,
  },
  {
    color: BRAND.blue,
    size: 860,
    at: { bottom: "-34%", right: "-18%" },
    x: [0, -200, -60, 0],
    y: [0, -140, -30, 0],
    scale: [1, 0.92, 1.1, 1],
    period: 46,
  },
  {
    color: INDIGO,
    size: 640,
    at: { top: "20%", left: "35%" },
    x: [0, -160, 140, 0],
    y: [0, 90, -70, 0],
    scale: [0.9, 1.08, 1, 0.9],
    period: 58,
  },
];

function grainTile(rgb: string): string {
  const [r, g, b] = rgb.split(" ").map((v) => Number(v) / 255);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1.4 -0.35'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

const GRAIN: Record<DeckTheme, string> = {
  dark: grainTile(TONES.dark.grain),
  light: grainTile(TONES.light.grain),
};

export function DeckAmbient({ theme = "dark" }: { theme?: DeckTheme }) {
  const tone = TONES[theme];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {BLOBS.map((blob, index) => (
        <m.div
          key={blob.color}
          className="absolute rounded-full"
          style={{
            ...blob.at,
            width: blob.size,
            height: blob.size,
            background: `radial-gradient(circle at center, ${blob.color}, transparent 68%)`,
          }}
          animate={{
            x: blob.x,
            y: blob.y,
            scale: blob.scale,
            opacity: tone.mesh[index] ?? 0,
          }}
          transition={{
            x: { duration: blob.period, ease: "easeInOut", repeat: Infinity },
            y: { duration: blob.period, ease: "easeInOut", repeat: Infinity },
            scale: {
              duration: blob.period,
              ease: "easeInOut",
              repeat: Infinity,
            },
            opacity: { duration: 0.6 },
          }}
        />
      ))}

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
          background: `radial-gradient(ellipse at center, transparent 50%, ${tone.vignette})`,
        }}
      />

      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          backgroundImage: GRAIN[theme],
          backgroundSize: "180px 180px",
          opacity: tone.grainOpacity,
        }}
      />
    </div>
  );
}
