import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import {
  CountRoll,
  DUR,
  EASE,
  MaskedText,
  SETTLE,
  Sheen,
  Spotlight,
  cueTransition,
} from "../_components/motion";

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

/** The meter under each figure is its share of the largest count. */
const MOST = Math.max(...PEOPLE.map((person) => person.count));

const CARD_W = 250;
const CARD_GAP = 24;
/** Card centres on the 1280×720 stage: 96px gutter, then one card per 274px. */
const LIGHT = [
  null,
  ...PEOPLE.map((_, index) => ({
    x: 96 + CARD_W / 2 + index * (CARD_W + CARD_GAP),
    y: 345,
    size: 520,
  })),
];

const BRAND_FILL = `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`;

function PersonCard({ person, index }: { person: Person; index: number }) {
  const step = useDeckStep();
  const position = index + 1;
  const spotlit = step === position;
  const lit = step >= position;

  return (
    <m.div
      className="w-[250px]"
      initial={{ opacity: 0.4, scale: 0.97, y: 0 }}
      animate={{
        opacity: lit ? 1 : 0.4,
        scale: spotlit ? 1.04 : lit ? 1 : 0.97,
        y: spotlit ? -8 : 0,
      }}
      transition={SETTLE}
    >
      <Sheen step={position} delay={0.2} className="rounded-[28px]">
        {/* p-7 (28px) inside a 28px outer radius keeps the avatar concentric
            with the card corner. */}
        <Card className="relative flex h-[300px] flex-col rounded-[28px] p-7">
          <div
            className="flex size-12 items-center justify-center rounded-full text-xl font-semibold text-white"
            style={{ background: BRAND_FILL }}
          >
            {person.name.slice(0, 1)}
          </div>

          <div className="mt-5 text-3xl font-semibold text-white">
            {person.name}
          </div>

          <div className="mt-auto">
            <CountRoll
              value={person.count}
              step={position}
              duration={1.3}
              delay={0.1}
              className="text-6xl leading-none font-semibold text-white"
            />
            {/* The label arrives with its figure, so a lit card never shows a
                caption hanging under an empty space. */}
            <m.div
              className="mt-3 text-sm text-white/45"
              initial={{ opacity: 0, y: 6 }}
              animate={lit ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={cueTransition(lit, 0.3, {
                duration: DUR.base,
                ease: EASE.out,
              })}
            >
              {person.countLabel}
            </m.div>
            <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
              <m.div
                aria-hidden
                className="h-full origin-left rounded-full"
                style={{ background: BRAND_FILL }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: lit ? person.count / MOST : 0 }}
                transition={cueTransition(lit, 0.2, {
                  duration: 1.3,
                  ease: EASE.expo,
                })}
              />
            </div>
          </div>
        </Card>
      </Sheen>
    </m.div>
  );
}

export function Slide09Team() {
  return (
    <Shell className="isolate py-12">
      <Spotlight shots={LIGHT} />

      <Reveal>
        <Kicker>In use · The team</Kicker>
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

      <p className="mt-12 text-3xl text-white/85">
        <MaskedText step={4} delay={0.55}>
          <Accent>
            <CountRoll value={303} step={4} duration={1.2} delay={0.7} />
          </Accent>{" "}
          pieces of work, raised by colleagues.
        </MaskedText>
      </p>

      <Footnote>
        Sessions, quick tasks and projects created in Eva between 11 January and
        16 September 2026, including items later cancelled.
      </Footnote>
    </Shell>
  );
}
