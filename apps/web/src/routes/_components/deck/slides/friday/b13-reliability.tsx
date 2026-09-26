import type { ReactNode } from "react";
import {
  IconAlertTriangle,
  IconLoader2,
  IconRefresh,
  IconSwitchHorizontal,
} from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

const CARD_CLASS =
  "flex h-full w-full flex-col justify-between rounded-[28px] bg-white/[0.05] p-8 ring-1 ring-white/[0.07]";

function Beat({
  shown,
  delay = 0,
  children,
}: {
  shown: boolean;
  delay?: number;
  children: ReactNode;
}) {
  // Each card has a faint dashed slot waiting for it, so the track of three is
  // visible from the first frame and the hanging spinner is not a lone card.
  return (
    <div className="relative h-[340px] w-[344px]">
      <m.div
        aria-hidden
        className="absolute inset-0 rounded-[28px] border border-dashed border-white/10"
        animate={{ opacity: shown ? 0 : 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      />
      <m.div
        className={CARD_CLASS}
        initial={{ opacity: 0, y: 26, scale: 0.94 }}
        animate={
          shown
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 26, scale: 0.94 }
        }
        transition={
          shown
            ? { type: "spring", bounce: 0, duration: 0.6, delay }
            : { duration: 0.25, ease: EASE_OUT }
        }
      >
        {children}
      </m.div>
    </div>
  );
}

export function FridayReliability() {
  const step = useDeckStep();
  const stuck = step < 1;

  return (
    <Shell className="py-14">
      <Kicker>Reliability</Kicker>
      <Title size="md">
        When it <Accent>goes wrong</Accent>.
      </Title>

      {/* The three cards are the story, so they take the middle of the stage. */}
      <div className="flex flex-1 items-center gap-7 pb-12">
        <Beat shown>
          <AnimatePresence mode="wait">
            {stuck ? (
              <m.div
                key="stuck"
                className="flex h-full flex-col justify-between"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ duration: 0.4 }}
              >
                <m.div
                  aria-hidden
                  className="w-fit"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <IconLoader2
                    size={40}
                    stroke={1.8}
                    className="text-white/45"
                  />
                </m.div>
                <div>
                  <CountUp
                    value={120}
                    duration={11}
                    suffix=" min"
                    className="text-6xl leading-none font-semibold tabular-nums text-white/50"
                  />
                  <div className="mt-4 text-base text-white/45">Working…</div>
                </div>
              </m.div>
            ) : (
              <m.div
                key="closed"
                className="flex h-full flex-col justify-between"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
                transition={{ type: "spring", bounce: 0, duration: 0.55 }}
              >
                <IconAlertTriangle
                  size={40}
                  stroke={1.6}
                  aria-hidden
                  className="text-amber-300/80"
                />
                <div>
                  <div className="text-3xl leading-tight font-semibold text-balance text-white">
                    Closed in minutes
                  </div>
                  <span className="mt-5 inline-block rounded-full bg-white/[0.08] px-4 py-1.5 text-sm text-white/65">
                    Partial reply kept
                  </span>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </Beat>

        <Beat shown={step >= 2}>
          <m.div
            aria-hidden
            className="w-fit"
            animate={{ rotate: step >= 2 ? 360 : 0 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.9,
              delay: 0.2,
            }}
          >
            <IconRefresh size={40} stroke={1.6} className="text-white/70" />
          </m.div>
          <div className="text-3xl leading-tight font-semibold text-balance text-white">
            An empty turn retries itself
          </div>
        </Beat>

        <Beat shown={step >= 3}>
          <IconSwitchHorizontal
            size={40}
            stroke={1.6}
            aria-hidden
            className="text-white/70"
          />
          <div>
            <div className="text-3xl leading-tight font-semibold text-balance text-white">
              Limit reached
            </div>
            <m.span
              className="mt-6 inline-block rounded-full px-5 py-2.5 text-base font-medium text-white"
              style={{
                background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
              }}
              initial={{ opacity: 0, scale: 0.86 }}
              animate={
                step >= 3
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 0, scale: 0.86 }
              }
              transition={{
                type: "spring",
                bounce: 0,
                duration: 0.6,
                delay: step >= 3 ? 0.35 : 0,
              }}
            >
              Use a shared account
            </m.span>
          </div>
        </Beat>
      </div>

      <Footnote>
        Watchdog 30 July 2026. Stalled turns retry once, 26 August 2026. Usage
        limits and the one-click switch, 4 September 2026, extended to quick
        tasks and projects 10 September 2026.
      </Footnote>
    </Shell>
  );
}
