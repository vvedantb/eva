import { IconCloud, IconDeviceLaptop } from "@tabler/icons-react";
import { m } from "motion/react";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const CHIPS = [
  "Sessions",
  "Quick tasks",
  "Projects",
  "Manager Ave",
  "Eva MCP",
  "Mobile",
  "Chrome extension",
];

const RADIUS = 185;

/** Evenly spaced around the circle, starting at the top and going clockwise. */
function orbitPoint(index: number): { x: number; y: number } {
  const angle = (index / CHIPS.length) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.round(Math.cos(angle) * RADIUS),
    y: Math.round(Math.sin(angle) * RADIUS),
  };
}

/**
 * The laptop-to-cloud move. Everything stays mounted; step 1 is what sends the
 * laptop away, lifts the cloud into place and throws the chips into orbit.
 */
export function CloudVisual() {
  const lifted = useDeckStep() >= 1;

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 flex items-center justify-center">
        <m.div
          aria-hidden
          className="absolute size-[320px] rounded-full blur-[70px]"
          style={{
            background: `radial-gradient(circle, ${BRAND.purple}, ${BRAND.blue}, transparent 70%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: lifted ? 0.35 : 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <m.div
          aria-hidden
          className="size-[370px] rounded-full border border-dashed border-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: lifted ? 1 : 0, rotate: 360 }}
          transition={{
            opacity: { duration: 0.6, ease: EASE_OUT, delay: 0.3 },
            rotate: { duration: 60, ease: "linear", repeat: Infinity },
          }}
        />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <m.div
          className="text-white/40"
          animate={
            lifted
              ? { scale: 0.6, opacity: 0.15, y: 90 }
              : { scale: 1, opacity: [0.45, 1, 0.45], y: 0 }
          }
          transition={
            lifted
              ? { duration: 0.7, ease: EASE_OUT }
              : { duration: 4, ease: "easeInOut", repeat: Infinity }
          }
        >
          <IconDeviceLaptop size={120} stroke={1.2} />
        </m.div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <m.div
          className="text-white"
          initial={{ opacity: 0, y: 60, scale: 0.8 }}
          animate={
            lifted
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 60, scale: 0.8 }
          }
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 }}
        >
          <IconCloud size={150} stroke={1.1} />
        </m.div>
      </div>

      {CHIPS.map((chip, index) => {
        const { x, y } = orbitPoint(index);
        return (
          <div
            key={chip}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <m.div
              className="rounded-full bg-white/[0.08] px-4 py-1.5 text-sm whitespace-nowrap text-white/85"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.7 }}
              animate={
                lifted
                  ? { opacity: 1, x, y, scale: 1 }
                  : { opacity: 0, x: 0, y: 0, scale: 0.7 }
              }
              transition={{
                type: "spring",
                bounce: 0,
                duration: 0.7,
                delay: lifted ? 0.45 + index * 0.12 : 0,
              }}
            >
              {chip}
            </m.div>
          </div>
        );
      })}
    </div>
  );
}
