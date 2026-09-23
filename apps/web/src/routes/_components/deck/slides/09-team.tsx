import { m } from "motion/react";
import { CountUp } from "../_components/CountUp";
import {
  Accent,
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

interface Person {
  /** First name only — the deck is shown outside the team. */
  name: string;
  count: number;
  /** One label under the figure. Roles and projects live in the notes. */
  countLabel: string;
}

/** Spotlight order, left to right. */
const PEOPLE: Person[] = [
  { name: "Matt", count: 27, countLabel: "sessions and tasks" },
  { name: "Zuza", count: 237, countLabel: "sessions and tasks" },
  { name: "Kezia", count: 39, countLabel: "quick tasks" },
  { name: "Vedant", count: 912, countLabel: "sessions and tasks" },
];

const BRAND_GRADIENT = "bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]";

function PersonCard({ person, index }: { person: Person; index: number }) {
  const step = useDeckStep();
  const position = index + 1;
  const spotlit = step === position;
  const lit = step >= position;

  return (
    <div className="relative w-[250px]">
      <m.div
        aria-hidden
        className={`pointer-events-none absolute -inset-3 rounded-[28px] blur-2xl ${BRAND_GRADIENT}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: spotlit ? 0.35 : 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
      <m.div
        initial={{ opacity: 0.4, scale: 0.97, y: 0 }}
        animate={{
          opacity: lit ? 1 : 0.4,
          scale: spotlit ? 1.04 : lit ? 1 : 0.97,
          y: spotlit ? -8 : 0,
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.6 }}
      >
        {/* p-7 (28px) inside a 28px outer radius keeps the avatar concentric
            with the card corner. */}
        <Card className="relative flex h-[300px] flex-col rounded-[28px] p-7">
          <div
            className={`flex size-12 items-center justify-center rounded-full text-xl font-semibold text-white ${BRAND_GRADIENT}`}
          >
            {person.name.slice(0, 1)}
          </div>

          <div className="mt-5 text-3xl font-semibold text-white">
            {person.name}
          </div>

          <div className="mt-auto">
            <CountUp
              value={person.count}
              step={position}
              className="text-6xl leading-none font-semibold tabular-nums text-white"
            />
            {/* The label arrives with its figure, so a lit card never shows a
                caption hanging under an empty space. */}
            <m.div
              className="mt-3 text-sm text-white/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: lit ? 1 : 0 }}
              transition={{
                duration: 0.4,
                ease: EASE_OUT,
                delay: lit ? 0.1 : 0,
              }}
            >
              {person.countLabel}
            </m.div>
          </div>
        </Card>
      </m.div>
    </div>
  );
}

export function Slide09Team() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Eva at work on CarePulse</Kicker>
        <Title size="md" className="text-balance">
          Built by the team, not just for them.
        </Title>
      </Reveal>

      <Stagger
        delayChildren={0.3}
        staggerChildren={0.1}
        className="mt-14 flex gap-6"
      >
        {PEOPLE.map((person, index) => (
          <StaggerItem key={person.name}>
            <PersonCard person={person} index={index} />
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={4} delay={0.4} className="mt-12">
        <p className="text-3xl text-white/85">
          <Accent>
            <CountUp value={303} step={4} delay={0.4} />
          </Accent>{" "}
          pieces of work, raised by colleagues.
        </p>
      </Reveal>

      <Footnote>
        Sessions, quick tasks and projects created in Eva between 11 January and
        16 September 2026, including items later cancelled.
      </Footnote>
    </Shell>
  );
}
