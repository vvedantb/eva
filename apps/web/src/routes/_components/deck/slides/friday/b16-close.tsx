import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";

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

/** One action: the number rolls in, a short rule draws, then the words rise. */
function Action({ action, index }: { action: string; index: number }) {
  const step = useDeckStep();
  const at = index + 1;
  const shown = step >= at;
  const current = step === at;

  return (
    <m.div
      className="flex items-baseline gap-6"
      initial={false}
      animate={{ opacity: shown && !current ? 0.5 : 1 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <span
        className="relative w-10 text-2xl font-semibold"
        style={{ color: BRAND.blue }}
      >
        <CountRoll value={at} step={at} duration={1.1} />
        <m.span
          aria-hidden
          className="absolute -bottom-2 left-0 h-[2px] w-6 origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: shown ? 1 : 0 }}
          transition={cueTransition(shown, 0.35, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        />
      </span>
      <span className="text-5xl leading-tight font-semibold text-balance text-white">
        <MaskedText step={at} delay={0.12}>
          {action}
        </MaskedText>
      </span>
    </m.div>
  );
}

export function FridayClose() {
  return (
    <Shell className="relative justify-center overflow-hidden py-14">
      <BrandSweep />

      <div className="relative">
        <Kicker>On Monday</Kicker>
        <Title size="md">Three things to try.</Title>

        <div className="mt-14 flex flex-col gap-7">
          {ACTIONS.map((action, index) => (
            <Action key={action} action={action} index={index} />
          ))}
        </div>

        <p className="mt-16 max-w-4xl text-3xl leading-snug text-pretty text-white/85">
          <MaskedText step={3} delay={0.85} stagger={0.06}>
            You do not need to be technical.{" "}
            <Accent>You need to know what you want.</Accent>
          </MaskedText>
        </p>
      </div>
    </Shell>
  );
}
