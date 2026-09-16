import { m } from "motion/react";
import { BRAND } from "./DeckPrimitives";

/**
 * The deck's persistent backdrop: two slow brand-coloured orbs, a faint dot
 * grid and a vignette. It lives outside `AnimatePresence` so it drifts
 * continuously rather than restarting on every slide change.
 */
export function DeckAmbient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <m.div
        className="absolute size-[680px] rounded-full blur-[120px]"
        style={{
          background: BRAND.purple,
          opacity: 0.16,
          top: "-12%",
          left: "-8%",
        }}
        animate={{ x: [0, 160, -60, 0], y: [0, 90, 180, 0] }}
        transition={{ duration: 28, ease: "easeInOut", repeat: Infinity }}
      />
      <m.div
        className="absolute size-[620px] rounded-full blur-[120px]"
        style={{
          background: BRAND.blue,
          opacity: 0.13,
          bottom: "-16%",
          right: "-6%",
        }}
        animate={{ x: [0, -140, 70, 0], y: [0, -110, -40, 0] }}
        transition={{ duration: 32, ease: "easeInOut", repeat: Infinity }}
      />

      <div
        className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px]"
        style={{
          maskImage:
            "radial-gradient(ellipse at center, black 0%, transparent 70%)",
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
    </div>
  );
}
