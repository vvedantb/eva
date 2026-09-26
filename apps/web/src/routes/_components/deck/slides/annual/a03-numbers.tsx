import { m } from "motion/react";
import {
  Accent,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  GridBackdrop,
  MaskedText,
  Spotlight,
} from "../../_components/motion";

interface Stat {
  value: number;
  label: string;
  delay: number;
  accent?: boolean;
}

/** Left to right; the lead figure rolls first and the rest trail it. */
const HEADLINE: Stat[] = [
  { value: 4732, label: "changes shipped", delay: 0.55, accent: true },
  { value: 887, label: "quick tasks raised", delay: 0.75 },
  { value: 367, label: "sessions", delay: 0.87 },
  { value: 1348, label: "release notes written", delay: 0.99 },
];

const SECONDARY: Stat[] = [
  { value: 16, label: "people with accounts", delay: 0 },
  { value: 19, label: "automations running", delay: 0.08 },
  { value: 504, label: "automation runs", delay: 0.16 },
  { value: 107, label: "documents written", delay: 0.24 },
];

const NUMBER_CLASS =
  "text-6xl leading-none font-semibold tracking-[-0.03em] tabular-nums";

/**
 * The light sits behind the lead figure on entry, then widens and drops onto
 * the second row as it arrives. Pixels are on the 1280×720 stage, so the glow
 * is only ever clipped by the slide edge.
 */
const LIGHT = [
  { x: 180, y: 262, size: 520 },
  { x: 640, y: 420, size: 900 },
];

export function AnnualNumbers() {
  return (
    <Shell className="isolate py-12">
      <Spotlight shots={LIGHT} />
      <Reveal>
        <Kicker>In use · The numbers</Kicker>
        <Title size="md">What eight months produced.</Title>
      </Reveal>

      <m.div
        aria-hidden
        className="mt-7 h-px w-40 origin-left rounded-full"
        style={{ background: BRAND_GRADIENT }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.35 }}
      />

      <div className="relative isolate mt-14">
        <GridBackdrop
          variant="dots"
          cell={28}
          period={9}
          className="-inset-8"
        />

        <Stagger
          delayChildren={0.45}
          staggerChildren={0.12}
          className="grid grid-cols-4 gap-6"
        >
          {HEADLINE.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className={NUMBER_CLASS}>
                {stat.accent ? (
                  <Accent>
                    <CountRoll
                      value={stat.value}
                      duration={1.7}
                      delay={stat.delay}
                    />
                  </Accent>
                ) : (
                  <CountRoll
                    value={stat.value}
                    duration={1.5}
                    delay={stat.delay}
                  />
                )}
              </div>
              <div className="mt-3 text-base text-white/50">{stat.label}</div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal step={1} distance={24} className="mt-12">
          <Card>
            <Stagger
              step={1}
              delayChildren={0.15}
              staggerChildren={0.08}
              className="grid grid-cols-4 gap-6"
            >
              {SECONDARY.map((stat) => (
                <StaggerItem key={stat.label}>
                  <div className="text-4xl leading-none font-semibold tracking-[-0.03em] tabular-nums">
                    <CountRoll
                      value={stat.value}
                      step={1}
                      duration={1.3}
                      delay={0.25 + stat.delay}
                    />
                  </div>
                  <div className="mt-2 text-base text-white/50">
                    {stat.label}
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        </Reveal>
      </div>

      <p className="mt-10 text-lg text-white/45">
        <MaskedText delay={2.1} duration={DUR.slow}>
          About 19 changes a day, every day, for eight months.
        </MaskedText>
      </p>

      <Footnote>
        Eva&rsquo;s own records and project history, 11 January to 16 September
        2026.
      </Footnote>
    </Shell>
  );
}
