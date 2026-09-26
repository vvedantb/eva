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
import {
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";

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

/** Where each column's first model sits in the catalogue, for the step 1 wave. */
const FIRST_INDEX = PROVIDERS.map((_, index) =>
  PROVIDERS.slice(0, index).reduce(
    (total, provider) => total + provider.models.length,
    0,
  ),
);

/** One light passes down the whole catalogue as it gathers into one count. */
const WAVE_GAP = 0.035;

function ModelChip({
  model,
  delay,
  wave,
}: {
  model: string;
  delay: number;
  wave: number;
}) {
  const gathered = useDeckStep() >= 1;

  return (
    <m.div
      className="relative overflow-hidden rounded-[10px] bg-white/[0.06] px-3 py-1 text-[13px] text-white/75"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DUR.slow, ease: EASE.expo, delay }}
    >
      <m.span
        aria-hidden
        className="absolute inset-0 bg-white/[0.12]"
        initial={{ opacity: 0 }}
        animate={{ opacity: gathered ? [0, 1, 0] : 0 }}
        transition={
          gathered
            ? {
                duration: 0.7,
                times: [0, 0.3, 1],
                ease: "easeOut",
                delay: wave,
              }
            : { duration: 0 }
        }
      />
      <span className="relative">{model}</span>
    </m.div>
  );
}

function ProviderColumn({
  provider,
  index,
}: {
  provider: Provider;
  index: number;
}) {
  const base = 0.3 + index * 0.1;
  const first = FIRST_INDEX[index] ?? 0;

  return (
    <div>
      <m.div
        className="h-[3px] origin-left rounded-full"
        style={{ background: BRAND_GRADIENT }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: DUR.hero, ease: EASE.expo, delay: base }}
      />

      {/* On the last step a light crosses each supplier in turn: the work moving on. */}
      <Sheen
        step={2}
        delay={0.35 + index * 0.14}
        className="mt-4 rounded-[18px] bg-white/[0.035] p-2"
      >
        <m.div
          className="px-2 pt-1 pb-2.5 text-sm font-medium text-white/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DUR.base, delay: base + 0.1 }}
        >
          {provider.name}
        </m.div>
        <div className="flex flex-col gap-1.5">
          {provider.models.map((model, modelIndex) => (
            <ModelChip
              key={model}
              model={model}
              delay={base + 0.2 + modelIndex * 0.05}
              wave={0.1 + (first + modelIndex) * WAVE_GAP}
            />
          ))}
        </div>
      </Sheen>
    </div>
  );
}

export function AnnualProviders() {
  const step = useDeckStep();

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Platform · Providers</Kicker>
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
        initial={{ opacity: 0, y: 18 }}
        animate={step >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
        transition={cueTransition(step >= 1, 0.35)}
      >
        <span className="text-6xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          <Accent>
            <CountRoll
              value={MODEL_COUNT}
              step={1}
              duration={1.4}
              delay={0.45}
            />
          </Accent>
        </span>
        <span className="text-xl text-white/55">models, one picker</span>
      </m.div>

      <p className="mt-8 text-center text-3xl text-white/85">
        <MaskedText step={2}>
          If one supplier stalls, <Accent>the work moves</Accent>.
        </MaskedText>
      </p>

      <Footnote>Model catalogue at 16 September 2026.</Footnote>
    </Shell>
  );
}
