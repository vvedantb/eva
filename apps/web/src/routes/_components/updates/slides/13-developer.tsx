import type { ReactNode } from "react";
import {
  IconBrush,
  IconBulb,
  IconHammer,
  IconSeeding,
  IconShieldCheck,
  IconTrendingUp,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Body,
  Card,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";

interface Archetype {
  name: string;
  icon: ReactNode;
  line: string;
  /** Part of the Sweeper + Maintainer blend we call the Gardener. */
  gardener: boolean;
}

/** Boris Cherny's five archetypes, in his order. */
const ARCHETYPES: Archetype[] = [
  {
    name: "Prototyper",
    icon: <IconBulb size={24} className="text-white/70" />,
    line: "Churns out ideas; most never ship",
    gardener: false,
  },
  {
    name: "Builder",
    icon: <IconHammer size={24} className="text-white/70" />,
    line: "Turns a prototype into a real product",
    gardener: false,
  },
  {
    name: "Sweeper",
    icon: <IconBrush size={24} className="text-white/70" />,
    line: "Simplifies, removes, tunes",
    gardener: true,
  },
  {
    name: "Grower",
    icon: <IconTrendingUp size={24} className="text-white/70" />,
    line: "Iterates a product towards fit",
    gardener: false,
  },
  {
    name: "Maintainer",
    icon: <IconShieldCheck size={24} className="text-white/70" />,
    line: "Keeps a mature system safe and fast",
    gardener: true,
  },
];

const GARDENING = [
  "Lints that catch mistakes before the model makes them",
  "Types that tell the model what is allowed",
  "Checks that run on every change",
  "Clear written rules the model reads first",
];

function ArchetypeCard({ archetype }: { archetype: Archetype }) {
  const spotlit = useDeckStep() >= 1;
  const lit = spotlit && archetype.gardener;
  const dimmed = spotlit && !archetype.gardener;

  return (
    <StaggerItem className="relative w-[196px]">
      <m.div
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-3xl bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: lit ? 0.35 : 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
      <m.div
        className="relative"
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: dimmed ? 0.4 : 1, scale: lit ? 1.04 : 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <Card className="h-[136px] p-4">
          {archetype.icon}
          <div className="mt-3 text-base font-semibold text-white">
            {archetype.name}
          </div>
          <div className="mt-1 text-xs leading-snug text-white/50">
            {archetype.line}
          </div>
        </Card>
      </m.div>
    </StaggerItem>
  );
}

export function Slide13Developer() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>The role of the developer</Kicker>
        <Title size="md">
          From writing code to <Accent>tending the garden</Accent>.
        </Title>
        <Body className="mt-4 max-w-5xl text-lg">
          The head of Claude Code has not written a line by hand in eight
          months. The job did not disappear. It moved.
        </Body>
      </Reveal>

      <div className="mt-6">
        <Stagger delayChildren={0.4} className="flex gap-4">
          {ARCHETYPES.map((archetype) => (
            <ArchetypeCard key={archetype.name} archetype={archetype} />
          ))}
        </Stagger>

        {/* Bracket spans the Sweeper and Maintainer cards: 424px → 1044px. */}
        <div className="relative h-[58px]">
          <Reveal
            step={1}
            distance={8}
            className="absolute top-2 left-[424px] flex w-[620px] flex-col items-center"
          >
            <div className="h-2 w-full rounded-t-lg border-x border-t border-white/15" />
            <div className="mt-2 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8] px-4 py-1 text-sm font-medium text-white">
              The Gardener
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal step={2} className="mt-2">
        <Card className="p-5">
          <div className="text-lg font-semibold text-white">
            What gardening looks like
          </div>
          <Stagger
            step={2}
            delayChildren={0.2}
            staggerChildren={0.06}
            className="mt-3 flex flex-wrap gap-2"
          >
            {GARDENING.map((item) => (
              <StaggerItem
                key={item}
                className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80"
              >
                {item}
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-3 text-xs text-white/45">
            A tidy codebase is one the model can work in without breaking
            things.
          </div>
        </Card>
      </Reveal>

      <Reveal step={3} className="mt-5">
        <p className="flex items-center gap-3 text-lg text-white/85">
          <IconSeeding size={22} className="shrink-0 text-[#3B7DD8]" />
          <span>
            For CarePulse the biggest job is finishing the{" "}
            <Accent>v3 migration</Accent>, which removes most of what trips the
            model up today.
          </span>
        </p>
      </Reveal>

      <Footnote>
        Archetypes: Boris Cherny, X, 28 June 2026. Hand-written code remark:
        Fortune Brainstorm Tech, reported 11 June 2026.
      </Footnote>
    </Shell>
  );
}
