import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** One per build step, in the order to do them. */
const ACTIONS: readonly string[] = [
  "Raise one quick task",
  "Open the inbox",
  "Review what is waiting",
];

/**
 * A slow brand wash drifting behind the list. No blur filter: the gradient's
 * own stops carry the softness, and a translating layer with a live blur is the
 * expensive path on a projector. The layer is far larger than the stage on
 * purpose, so where each circle reaches zero alpha is off the slide rather than
 * showing as an edge across it.
 */
function BrandSweep() {
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute -inset-[80%] opacity-55"
      style={{
        background: `radial-gradient(closest-side at 46% 48%, ${BRAND.purple}55, transparent), radial-gradient(closest-side at 56% 54%, ${BRAND.blue}44, transparent)`,
      }}
      animate={{ x: ["-5%", "5%"] }}
      transition={{
        duration: 18,
        repeat: Infinity,
        repeatType: "mirror",
        ease: "easeInOut",
      }}
    />
  );
}

export function FridayClose() {
  const step = useDeckStep();

  return (
    <Shell className="relative justify-center overflow-hidden py-14">
      <BrandSweep />

      <div className="relative">
        <Kicker>On Monday</Kicker>
        <Title size="md">Three things to try.</Title>

        <div className="mt-14 flex flex-col gap-7">
          {ACTIONS.map((action, index) => {
            const shown = step >= index + 1;
            return (
              <div key={action} className="flex items-baseline gap-6">
                <m.span
                  className="w-10 text-2xl font-semibold tabular-nums"
                  style={{ color: BRAND.blue }}
                  animate={{ opacity: shown ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {index + 1}
                </m.span>
                <m.span
                  className="text-5xl leading-tight font-semibold text-balance text-white"
                  initial={{ opacity: 0, y: 26, filter: "blur(10px)" }}
                  animate={
                    shown
                      ? { opacity: 1, y: 0, filter: "blur(0px)" }
                      : { opacity: 0, y: 26, filter: "blur(10px)" }
                  }
                  transition={{ type: "spring", bounce: 0, duration: 0.7 }}
                >
                  {action}
                </m.span>
              </div>
            );
          })}
        </div>

        <m.p
          className="mt-16 max-w-4xl text-3xl leading-snug text-pretty text-white/85"
          initial={{ opacity: 0, y: 18 }}
          animate={step >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{
            type: "spring",
            bounce: 0,
            duration: 0.8,
            delay: step >= 3 ? 0.75 : 0,
          }}
        >
          You do not need to be technical.{" "}
          <Accent>You need to know what you want.</Accent>
        </m.p>
      </div>
    </Shell>
  );
}
