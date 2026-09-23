import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

interface Provider {
  name: string;
  models: readonly string[];
}

/** The shipped catalogue, provider by provider, legacy entries excluded. */
const PROVIDERS: readonly Provider[] = [
  {
    name: "Claude",
    models: [
      "Fable 5.1",
      "Opus",
      "Opus 4.6",
      "Opus 4.5",
      "Opus Plan",
      "Sonnet",
      "Haiku",
    ],
  },
  {
    name: "Codex",
    models: ["GPT-6 Astra", "GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna"],
  },
  {
    name: "OpenCode",
    models: ["GPT-6 Astra", "GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna"],
  },
  {
    name: "Cursor",
    models: [
      "Grok 4.7",
      "Grok 4.6",
      "Grok 4.5",
      "GPT-6 Astra",
      "Gemini 3.1 Pro",
      "Composer 2.5",
    ],
  },
];

const MODEL_COUNT = PROVIDERS.reduce(
  (total, provider) => total + provider.models.length,
  0,
);

function ProviderColumn({
  provider,
  index,
}: {
  provider: Provider;
  index: number;
}) {
  const base = 0.25 + index * 0.12;

  return (
    <div>
      <m.div
        className="h-[3px] origin-left rounded-full"
        style={{
          background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: base }}
      />

      <div className="mt-4 rounded-[18px] bg-white/[0.035] p-2">
        <div className="px-2 pt-1 pb-2.5 text-sm font-medium text-white/80">
          {provider.name}
        </div>
        <div className="flex flex-col gap-1.5">
          {provider.models.map((model, modelIndex) => (
            <m.div
              key={model}
              className="rounded-[10px] bg-white/[0.06] px-3 py-1 text-[13px] text-white/75"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.45,
                ease: EASE_OUT,
                delay: base + 0.2 + modelIndex * 0.06,
              }}
            >
              {model}
            </m.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnnualProviders() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Model providers</Kicker>
        <Title size="md">Not tied to one supplier.</Title>
      </Reveal>

      <div className="mt-9 grid grid-cols-4 gap-5">
        {PROVIDERS.map((provider, index) => (
          <ProviderColumn
            key={provider.name}
            provider={provider}
            index={index}
          />
        ))}
      </div>

      <m.div
        className="mt-9 flex items-baseline justify-center gap-4"
        initial={{ opacity: 0, y: 14 }}
        animate={step >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={
          step >= 1
            ? { type: "spring", bounce: 0, duration: 0.6 }
            : { duration: 0.25, ease: EASE_OUT }
        }
      >
        <span className="text-6xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          <Accent>
            <CountUp value={MODEL_COUNT} step={1} duration={1.3} delay={0.15} />
          </Accent>
        </span>
        <span className="text-xl text-white/55">models, one picker</span>
      </m.div>

      <Reveal step={2} className="mt-8 text-center">
        <p className="text-3xl text-white/85">
          If one supplier stalls, <Accent>the work moves</Accent>.
        </p>
      </Reveal>

      <Footnote>Model catalogue at 16 September 2026.</Footnote>
    </Shell>
  );
}
