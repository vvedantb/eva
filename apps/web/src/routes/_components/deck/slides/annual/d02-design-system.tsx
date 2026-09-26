import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, MaskedText, Sheen } from "../../_components/motion";
import { MoA3AccentRoll } from "../_parts/MoA3AccentRoll";
import { MOA3_TILES } from "../_parts/MoA3DesignTiles";

const COLUMNS = 6;
const FIGURE = "text-6xl leading-none font-semibold";

/**
 * Where each tile starts before the set assembles: a small, fixed scatter so
 * the pieces read as loose decisions that snap into one grid.
 */
function scatter(index: number): { x: number; y: number; rotate: number } {
  return {
    x: (((index * 37) % 9) - 4) * 10,
    y: (((index * 53) % 7) - 3) * 10 + 24,
    rotate: (((index * 29) % 11) - 5) * 1.6,
  };
}

/** The set assembles from the middle out, so it reads as one move, not twelve. */
function assembleDelay(index: number): number {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return 0.35 + (Math.abs(column - 2.5) + Math.abs(row - 0.5)) * 0.07;
}

export function AnnualDesignSystem() {
  const step = useDeckStep();
  // The figures take the stage on step 1; the set comes back lit for the close.
  const dimmed = step === 1;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Craft · Design system</Kicker>
        <Title size="md">One visual language.</Title>
      </Reveal>

      <div className="mt-9 grid grid-cols-6 gap-4">
        {MOA3_TILES.map((tile, index) => {
          const from = scatter(index);
          const column = index % COLUMNS;
          return (
            <m.div
              key={tile.id}
              initial={{ opacity: 0, scale: 0.9, ...from }}
              animate={{
                opacity: dimmed ? 0.5 : 1,
                scale: 1,
                x: 0,
                y: 0,
                rotate: 0,
              }}
              transition={
                step === 0
                  ? {
                      duration: DUR.hero + 0.2,
                      ease: EASE.expo,
                      delay: assembleDelay(index),
                    }
                  : { duration: DUR.slow, ease: EASE.out }
              }
            >
              {/* Once assembled, and again on the close, light runs across the set. */}
              <Sheen
                step={2}
                delay={0.5 + column * 0.06}
                className="rounded-[14px]"
              >
                <Sheen delay={1.35 + column * 0.06} className="rounded-[14px]">
                  <div className="flex h-[72px] items-center justify-center rounded-[14px] bg-white/[0.05]">
                    {tile.node}
                  </div>
                </Sheen>
              </Sheen>
            </m.div>
          );
        })}
      </div>

      <Reveal
        step={1}
        distance={24}
        className="mt-11 flex justify-center gap-28"
      >
        <div className="text-center">
          <div className={FIGURE}>
            <MoA3AccentRoll value={110} step={1} delay={0.2} duration={1.3} />
          </div>
          <div className="mt-4 text-base text-white/50">shared components</div>
        </div>
        <div className="text-center">
          <div className={FIGURE}>
            <MoA3AccentRoll
              value={18197}
              step={1}
              delay={0.35}
              duration={1.6}
            />
          </div>
          <div className="mt-4 text-base text-white/50">lines behind them</div>
        </div>
      </Reveal>

      <div className="mt-11 text-center">
        <MaskedText step={2} className="text-3xl text-white/85">
          Every new screen <Accent>starts consistent</Accent>.
        </MaskedText>
      </div>

      <Footnote>Measured 23 September 2026.</Footnote>
    </Shell>
  );
}
