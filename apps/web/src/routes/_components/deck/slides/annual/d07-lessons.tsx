import { AnimatePresence, m } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** Verbatim from the project's written notes. */
const QUOTES: readonly string[] = [
  "Most failures are not model failures. They are system design failures.",
  "Autonomy is an infrastructure decision.",
];

function LargeQuote({ text }: { text: string }) {
  return (
    <m.blockquote
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, y: 16, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <p className="max-w-4xl text-center text-5xl leading-[1.15] font-medium tracking-[-0.02em] text-balance text-white">
        {text}
      </p>
    </m.blockquote>
  );
}

function PairedQuotes() {
  return (
    <m.div
      className="absolute inset-0 flex flex-col items-center justify-center gap-10"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <div className="flex gap-10">
        {QUOTES.map((quote) => (
          <blockquote
            key={quote}
            className="w-[440px] text-2xl leading-snug text-balance text-white/60"
          >
            {quote}
          </blockquote>
        ))}
      </div>
      <Reveal step={2} delay={0.25} className="text-center">
        <p className="text-3xl text-white/85">
          Both point the same way: <Accent>build the system</Accent>.
        </p>
      </Reveal>
    </m.div>
  );
}

export function AnnualLessons() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Lessons</Kicker>
        <Title size="md">What we learned.</Title>
      </Reveal>

      <div className="relative mt-6 h-[400px] w-full">
        <AnimatePresence>
          {step >= 2 ? (
            <PairedQuotes key="paired" />
          ) : (
            <LargeQuote key={step} text={QUOTES[step]} />
          )}
        </AnimatePresence>
      </div>

      <Footnote>From the project&apos;s own written notes.</Footnote>
    </Shell>
  );
}
