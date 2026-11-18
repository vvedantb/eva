import { m } from "motion/react";
import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE } from "../../_components/motion";

interface Quarter {
  when: string;
  items: readonly string[];
}

/** One column per build step. Dates and sources are in the speaker note. */
const QUARTERS: readonly Quarter[] = [
  {
    when: "Dec – Feb",
    items: [
      "AQP list notes",
      "eProcurement evaluation and moderation",
      "Sandbox setup for the team",
    ],
  },
  {
    when: "Mar – May",
    items: [
      "Mobilisation on the provider homepage",
      "CQC notifications for AQP homes only",
      "Resource centre tidy-up",
    ],
  },
  {
    when: "Jun – Aug",
    items: [
      "Domiciliary care quality dashboards",
      "SUPA archives for both services",
      "Referral portal dashboard",
    ],
  },
  {
    when: "Sep – Nov",
    items: [
      "Provider homepage redesign",
      "Central contact overview",
      "SUPA tracker",
      "Jev PID checker",
      "Nursing home dashboard comments",
    ],
  },
];

function QuarterCard({ quarter, index }: { quarter: Quarter; index: number }) {
  const shown = useDeckStep() >= index + 1;
  return (
    <m.div
      className="flex-1"
      initial={{ opacity: 0.25, y: 12 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 12 }}
      transition={{ duration: DUR.slow, ease: EASE.expo }}
    >
      {/* p-6 inside a 24px outer radius keeps the corners concentric. */}
      <Card className="flex h-[330px] flex-col gap-4 rounded-[24px] p-6">
        <div className="text-sm font-medium tracking-[0.18em] text-white/45 uppercase">
          {quarter.when}
        </div>
        <ul className="flex flex-col gap-3">
          {quarter.items.map((item) => (
            <li key={item} className="text-lg leading-snug text-white/85">
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </m.div>
  );
}

export function AnnualCarePulse() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Meanwhile, on <Accent>CarePulse</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 flex gap-4">
        {QUARTERS.map((quarter, index) => (
          <QuarterCard key={quarter.when} quarter={quarter} index={index} />
        ))}
      </div>
    </Shell>
  );
}
