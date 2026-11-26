import { IconArrowRight } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  DUR,
  DrawPath,
  EASE,
  Sheen,
  cueTransition,
} from "../../_components/motion";

const NEXT_STEPS: readonly string[] = [
  "Model checks first",
  "Ready means merged",
  "Deploys itself",
  "People sign off the risky part",
];

const RAIL_WIDTH = 896;

/** The four pipeline stages for "What's next": each lands in turn as a light runs beneath them. */
export function MoF3NextSteps({ shown }: { shown: boolean }) {
  return (
    <div className="relative mt-20">
      <div className="flex items-center gap-3">
        {NEXT_STEPS.map((label, index) => {
          const at = 0.1 + index * 0.16;
          const last = index === NEXT_STEPS.length - 1;
          return (
            <div key={label} className="flex items-center gap-3">
              {index > 0 ? (
                <m.span
                  className="origin-left"
                  initial={{ opacity: 0, x: -8 }}
                  animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                  transition={cueTransition(shown, at - 0.06, {
                    duration: DUR.base,
                    ease: EASE.out,
                  })}
                >
                  <IconArrowRight
                    size={18}
                    className="text-white/35"
                    aria-hidden
                  />
                </m.span>
              ) : null}
              <m.div
                initial={{ opacity: 0, y: 14 }}
                animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                transition={cueTransition(shown, at, {
                  duration: DUR.slow,
                  ease: EASE.expo,
                })}
              >
                <Sheen
                  step={2}
                  delay={at + 0.35}
                  className={
                    last
                      ? "rounded-full bg-white/[0.1] ring-1 ring-[#8B3FB8]/60"
                      : "rounded-full bg-white/[0.07]"
                  }
                >
                  <span className="block px-5 py-2.5 text-base text-white/80">
                    {label}
                  </span>
                </Sheen>
              </m.div>
            </div>
          );
        })}
      </div>
      {/* A light runs the length of the pipeline as each stage lands. */}
      <DrawPath
        d={`M0 1 L${RAIL_WIDTH} 1`}
        width={RAIL_WIDTH}
        height={2}
        step={2}
        delay={0.05}
        duration={0.75}
        strokeWidth={1}
        dot
        className="absolute -bottom-5 left-0"
      />
    </div>
  );
}
