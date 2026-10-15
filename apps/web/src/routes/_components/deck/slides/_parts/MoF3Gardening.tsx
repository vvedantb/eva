import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, DrawPath, EASE, cueTransition } from "../../_components/motion";

const GARDENING: readonly string[] = [
  "Lints that catch mistakes early",
  "Types that say what is allowed",
  "Checks on every change",
  "Written rules the model reads",
];

const CHIP_GAP = 12;
const ROOTS_H = 64;

/**
 * What gardening means, growing out of the Gardener label: one root per
 * practice draws down from \`from\`, and each chip lands where its root ends.
 * Chips sit centred in four equal columns so the roots can find them.
 */
export function MoF3Gardening({
  from,
  width,
}: {
  from: number;
  width: number;
}) {
  const shown = useDeckStep() >= 2;
  const column = (width - CHIP_GAP * 3) / 4;
  const root = (index: number) => {
    const x = index * (column + CHIP_GAP) + column / 2;
    return `M${from} 0 C${from} ${ROOTS_H * 0.55}, ${x} ${ROOTS_H * 0.45}, ${x} ${ROOTS_H - 4}`;
  };
  return (
    <>
      <div className="relative" style={{ height: ROOTS_H }}>
        {GARDENING.map((item, index) => (
          <DrawPath
            key={item}
            d={root(index)}
            width={width}
            height={ROOTS_H}
            step={2}
            delay={index * 0.08}
            duration={0.6}
            strokeWidth={1}
            color="rgba(255,255,255,0.18)"
            dot
            className="absolute inset-0"
          />
        ))}
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(4, ${column}px)`,
          gap: CHIP_GAP,
        }}
      >
        {GARDENING.map((item, index) => (
          <m.div
            key={item}
            className="justify-self-center"
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={
              shown
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: -10, scale: 0.94 }
            }
            transition={cueTransition(shown, 0.45 + index * 0.08, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            <div className="rounded-full bg-white/[0.07] px-5 py-2.5 text-base whitespace-nowrap text-white/80">
              {item}
            </div>
          </m.div>
        ))}
      </div>
    </>
  );
}
