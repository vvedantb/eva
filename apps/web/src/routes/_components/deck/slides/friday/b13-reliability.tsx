import { IconRefresh, IconSwitchHorizontal } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  Magnify,
  MaskedText,
  Morph,
  Sheen,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import {
  MOF2_BEAT,
  MoF2Beat,
  MoF2Closed,
  MoF2Stuck,
} from "../_parts/MoF2Beats";

/** Centre of each card in the row, for the light that follows the story. */
const centre = (index: number) => ({
  x: MOF2_BEAT.width / 2 + index * (MOF2_BEAT.width + MOF2_BEAT.gap),
  y: MOF2_BEAT.height / 2,
  size: 460,
});
const GLOW = [centre(0), centre(0), centre(1), centre(2)];

export function FridayReliability() {
  const step = useDeckStep();
  const retried = step >= 2;
  const switched = step >= 3;
  const focus = Math.max(0, step - 1);

  return (
    <Shell className="py-14">
      <Kicker>Trust and reach · Reliability</Kicker>
      <Title size="md">
        When it breaks, <Accent>you know</Accent>.
      </Title>

      {/* The three cards are the story, so they take the middle of the stage. */}
      <div className="flex flex-1 items-center pb-12">
        <div className="relative isolate">
          <Spotlight shots={GLOW} className="-inset-24 overflow-visible" />
          <Magnify
            focus={focus}
            scale={1.03}
            dimTo={0.62}
            className="flex gap-7"
          >
            <MoF2Beat key="closed" shown step={1} delay={0.45}>
              <Morph
                className="h-full"
                states={[
                  <MoF2Stuck key="stuck" />,
                  <MoF2Closed key="closed" />,
                ]}
              />
            </MoF2Beat>

            <MoF2Beat key="retry" shown={retried} step={2}>
              <m.div
                aria-hidden
                className="w-fit"
                initial={{ rotate: 0 }}
                animate={{ rotate: retried ? 360 : 0 }}
                transition={cueTransition(retried, 0.3, {
                  duration: 1.2,
                  ease: EASE.inOut,
                })}
              >
                <IconRefresh size={40} stroke={1.6} className="text-white/70" />
              </m.div>
              <div className="text-3xl leading-tight font-semibold text-balance text-white">
                <MaskedText step={2} delay={0.2}>
                  An empty turn retries itself
                </MaskedText>
              </div>
            </MoF2Beat>

            <MoF2Beat key="switch" shown={switched} step={3}>
              <m.span
                aria-hidden
                className="w-fit text-white/70"
                initial={{ x: -10, opacity: 0 }}
                animate={
                  switched ? { x: 0, opacity: 1 } : { x: -10, opacity: 0 }
                }
                transition={cueTransition(switched, 0.15, {
                  duration: DUR.slow,
                  ease: EASE.expo,
                })}
              >
                <IconSwitchHorizontal size={40} stroke={1.6} />
              </m.span>
              <div>
                <div className="text-3xl leading-tight font-semibold text-balance text-white">
                  <MaskedText step={3} delay={0.2}>
                    Limit reached
                  </MaskedText>
                </div>
                <m.div
                  className="mt-6 w-fit"
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={
                    switched
                      ? { opacity: 1, y: 0, scale: 1 }
                      : { opacity: 0, y: 10, scale: 0.92 }
                  }
                  transition={cueTransition(switched, 0.45, {
                    duration: DUR.slow,
                    ease: EASE.expo,
                  })}
                >
                  <Sheen step={3} delay={0.95} className="rounded-full">
                    <span
                      className="inline-block rounded-full px-5 py-2.5 text-base font-medium text-white"
                      style={{ background: BRAND_GRADIENT }}
                    >
                      Use a shared account
                    </span>
                  </Sheen>
                </m.div>
              </div>
            </MoF2Beat>
          </Magnify>
        </div>
      </div>

      <Footnote>
        Watchdog 30 July 2026. Stalled turns retry once, 26 August 2026. Usage
        limits and the one-click switch, 4 September 2026, extended to quick
        tasks and projects 10 September 2026.
      </Footnote>
    </Shell>
  );
}
