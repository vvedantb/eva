import { IconCloud, IconDeviceLaptop } from "@tabler/icons-react";
import { m } from "motion/react";
import { Layer } from "../../_components/DeckCamera";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, LEAVE } from "../../_components/motion";
import { Handoff, Orbit, RADIUS, Satellite } from "./MoF1CloudOrbit";

const CHIPS = [
  "Sessions",
  "Quick tasks",
  "Projects",
  "Manager Ave",
  "Eva MCP",
  "Mobile",
  "Chrome extension",
];

/** The orbit swings this far into place, so the chips arrive on a curve. */
const SWING = 38;
const SWIRL = { duration: 1.6, ease: EASE.expo, delay: 0.35 };

/** Evenly spaced around the circle, starting at the top and going clockwise. */
function orbitPoint(index: number): { x: number; y: number } {
  const angle = (index / CHIPS.length) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.round(Math.cos(angle) * RADIUS),
    y: Math.round(Math.sin(angle) * RADIUS),
  };
}

/**
 * The laptop-to-cloud move. Everything stays mounted; step 1 sends the laptop
 * away, lifts the cloud into place, draws the orbit and swings the chips onto
 * it. Pieces sit on separate `Layer` depths so the slide's `Camera` turns the
 * flat orbit into a real one: cloud in front, chips mid-way, ring on the
 * neutral plane, laptop behind. Depths stay well inside the ±120px budget.
 */
export function CloudVisual() {
  const lifted = useDeckStep() >= 1;

  return (
    <div
      className="relative h-full w-full"
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <m.div
          aria-hidden
          className="absolute size-[460px] rounded-full"
          style={{
            background: `radial-gradient(circle closest-side, ${BRAND.purple}, ${BRAND.blue}88 45%, transparent)`,
          }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: lifted ? 0.3 : 0, scale: lifted ? 1 : 0.6 }}
          transition={{ duration: 1.4, ease: EASE.expo }}
        />
      </div>

      <Layer depth={0} className="absolute inset-0">
        <Orbit lifted={lifted} />
        <Satellite lifted={lifted} />
      </Layer>

      <Layer
        depth={-50}
        className="absolute inset-0 flex items-center justify-center"
      >
        <m.div
          className="text-white/40"
          animate={
            lifted
              ? { scale: 0.6, opacity: 0.12, y: 110 }
              : { scale: 1, opacity: [0.45, 1, 0.45], y: 0 }
          }
          transition={
            lifted
              ? { duration: DUR.hero, ease: EASE.expo }
              : { duration: 4, ease: "easeInOut", repeat: Infinity }
          }
        >
          <IconDeviceLaptop size={120} stroke={1.2} />
        </m.div>
        <Handoff lifted={lifted} />
      </Layer>

      <Layer
        depth={70}
        className="absolute inset-0 flex items-center justify-center"
      >
        <m.div
          className="text-white"
          initial={{ opacity: 0, y: 70, scale: 0.7 }}
          animate={
            lifted
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 70, scale: 0.7 }
          }
          transition={
            lifted
              ? {
                  duration: 1.1,
                  ease: EASE.expo,
                  delay: 0.2,
                  opacity: { duration: DUR.base, delay: 0.2 },
                }
              : LEAVE
          }
        >
          <IconCloud size={150} stroke={1.1} />
        </m.div>
      </Layer>

      <Layer depth={30} className="absolute inset-0">
        {/* The whole orbit swings in; each chip counter-turns to stay upright. */}
        <m.div
          className="absolute inset-0"
          initial={{ rotate: -SWING }}
          animate={{ rotate: lifted ? 0 : -SWING }}
          transition={lifted ? SWIRL : { duration: 0 }}
        >
          {CHIPS.map((chip, index) => {
            const { x, y } = orbitPoint(index);
            return (
              <div
                key={chip}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <m.div
                  className="flex items-center gap-2 rounded-full bg-[#1f1e27] py-1.5 pr-4 pl-3 text-sm whitespace-nowrap text-white/85"
                  initial={{
                    opacity: 0,
                    x: x / 2,
                    y: y / 2,
                    scale: 0.7,
                    rotate: SWING,
                  }}
                  animate={
                    lifted
                      ? { opacity: 1, x, y, scale: 1, rotate: 0 }
                      : {
                          opacity: 0,
                          x: x / 2,
                          y: y / 2,
                          scale: 0.7,
                          rotate: SWING,
                        }
                  }
                  transition={
                    lifted
                      ? {
                          duration: 1.2,
                          ease: EASE.expo,
                          delay: 0.45 + index * 0.07,
                          rotate: SWIRL,
                          opacity: {
                            duration: DUR.base,
                            delay: 0.45 + index * 0.07,
                          },
                        }
                      : LEAVE
                  }
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{
                      background: index % 2 ? BRAND.blue : BRAND.purple,
                    }}
                  />
                  {chip}
                </m.div>
              </div>
            );
          })}
        </m.div>
      </Layer>
    </div>
  );
}
