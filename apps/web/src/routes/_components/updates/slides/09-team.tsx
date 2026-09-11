import { m } from "motion/react";
import { CountUp } from "../_components/CountUp";
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

interface Person {
  /** First name only — the deck is shown outside the team. */
  name: string;
  role: string;
  headlines: string[];
  count: number;
  countLabel: string;
}

/** Spotlight order, left to right. */
const PEOPLE: Person[] = [
  {
    name: "Matt",
    role: "Referral portal",
    headlines: [
      "AQP list map",
      "Referral dashboard",
      "Referral tabs and cancellation reasons",
    ],
    count: 14,
    countLabel: "sessions and quick tasks",
  },
  {
    name: "Zuza",
    role: "Design and admin",
    headlines: [
      "User management pages",
      "Admin KPI dashboards",
      "KPI cards, badges and tables polish",
    ],
    count: 78,
    countLabel: "sessions and quick tasks",
  },
  {
    name: "Kezia",
    role: "Referral portal and dom care",
    headlines: [
      "Exports and audit trails",
      "Broker and borough filters",
      "Automated decline and expiry emails",
    ],
    count: 24,
    countLabel: "quick tasks and one project",
  },
  {
    name: "Vedant",
    role: "Product",
    headlines: [
      "Dom care SUPA archive",
      "Nursing home SUPA archive",
      "eProcurement fixes",
    ],
    count: 60,
    countLabel: "CarePulse sessions",
  },
];

const BRAND_GRADIENT = "bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]";

function PersonCard({ person, index }: { person: Person; index: number }) {
  const step = useDeckStep();
  const position = index + 1;
  const spotlit = step === position;
  const lit = step >= position;

  return (
    <div className="relative w-64">
      <m.div
        aria-hidden
        className={`pointer-events-none absolute -inset-3 rounded-[28px] blur-2xl ${BRAND_GRADIENT}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: spotlit ? 0.35 : 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
      <m.div
        initial={{ opacity: 0.45, scale: 0.97, y: 0 }}
        animate={{
          opacity: lit ? 1 : 0.45,
          scale: spotlit ? 1.03 : lit ? 1 : 0.97,
          y: spotlit ? -6 : 0,
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.6 }}
      >
        <Card className="relative flex h-[330px] flex-col p-6">
          <div
            className={`flex size-11 items-center justify-center rounded-full text-lg font-semibold text-white ${BRAND_GRADIENT}`}
          >
            {person.name.slice(0, 1)}
          </div>

          <div className="mt-4 text-xl font-semibold text-white">
            {person.name}
          </div>
          {/* Fixed two-line box so a role that wraps does not push one card's
              list out of line with the other three. */}
          <div className="mt-1 h-8 text-xs leading-4 tracking-[0.18em] text-white/40 uppercase">
            {person.role}
          </div>

          <ul className="mt-4 space-y-2">
            {person.headlines.map((headline) => (
              <li key={headline} className="flex gap-2 text-sm text-white/80">
                <span
                  aria-hidden
                  className={`mt-[7px] size-1.5 shrink-0 rounded-full ${BRAND_GRADIENT}`}
                />
                <span className="leading-snug">{headline}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto">
            <CountUp
              value={person.count}
              step={position}
              className="text-3xl font-semibold tabular-nums"
            />
            <div className="mt-1 text-xs text-white/45">
              {person.countLabel}
            </div>
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
        <Title size="md">Built by the team, not just for them.</Title>
        <Body className="mt-4 max-w-4xl text-lg">
          Colleagues described what they needed. Eva built it in the browser,
          and they reviewed it.
        </Body>
      </Reveal>

      <Stagger
        delayChildren={0.3}
        staggerChildren={0.1}
        className="mt-8 flex gap-5"
      >
        {PEOPLE.map((person, index) => (
          <StaggerItem key={person.name}>
            <PersonCard person={person} index={index} />
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={4} delay={0.4} className="mt-7">
        <p className="text-lg text-white/70">
          <Accent>
            <CountUp value={116} step={4} delay={0.4} />
          </Accent>{" "}
          pieces of work raised by colleagues, straight from the people who
          needed them.
        </p>
      </Reveal>

      <Footnote>
        Counts are sessions, quick tasks and projects created in Eva between 1
        June and 10 September 2026, including items later cancelled.
      </Footnote>
    </Shell>
  );
}
