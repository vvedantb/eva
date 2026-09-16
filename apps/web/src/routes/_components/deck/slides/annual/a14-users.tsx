import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import {
  Accent,
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";

interface Change {
  label: string;
  before: string;
  after: string;
}

/** Top to bottom, in the order they were decided. */
const CHANGES: Change[] = [
  {
    label: "Too much on screen",
    before: "Reviews, differences, meters, consoles",
    after: "Simple Mode: the conversation and a preview",
  },
  {
    label: "Choosing a model",
    before: "A searchable list of twenty",
    after: "One slider, cheapest to strongest",
  },
  {
    label: "Wording",
    before: "Plan mode was called PRD",
    after: "Called Plan, because that is what people meant",
  },
  {
    label: "The daily summary",
    before: "Written for engineers",
    after: "Plain language, no file names or jargon",
  },
];

const FOLLOW_ONS = [
  "Every screen made usable on a phone, twice audited",
  "Keyboard shortcuts made visible and changeable",
  "Landing pages that said 'pick something from the sidebar' removed, because on a phone the sidebar is closed",
];

export function AnnualUsers() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>The people using it</Kicker>
        <Title size="md">Built for who is actually looking at it.</Title>
        <Body className="mt-3 max-w-5xl text-base">
          Most people opening Eva are not engineers. Several of the year&apos;s
          decisions exist only because of that.
        </Body>
      </Reveal>

      <Stagger
        delayChildren={0.25}
        staggerChildren={0.09}
        className="mt-6 flex flex-col gap-[10px]"
      >
        {CHANGES.map((change) => (
          <StaggerItem key={change.label}>
            <Card className="flex h-[62px] w-[1010px] items-center gap-4 px-5 py-0">
              <div className="w-[190px] shrink-0 text-xs tracking-[0.16em] text-white/35 uppercase">
                {change.label}
              </div>
              <div className="w-[310px] shrink-0 text-base text-white/45 line-through decoration-white/25">
                {change.before}
              </div>
              <IconArrowRight
                size={18}
                className="shrink-0 text-[#3B7DD8]"
                aria-hidden
              />
              <div className="text-base leading-snug text-white/90">
                {change.after}
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} className="mt-4">
        <Card className="w-[1010px] p-5">
          <Stagger
            step={1}
            delayChildren={0.2}
            staggerChildren={0.08}
            className="flex flex-col gap-2"
          >
            {FOLLOW_ONS.map((row) => (
              <StaggerItem key={row} className="flex gap-2">
                <IconCheck
                  size={16}
                  stroke={2}
                  className="mt-[3px] shrink-0 text-[#3B7DD8]"
                  aria-hidden
                />
                <span className="text-sm leading-snug text-white/75">
                  {row}
                </span>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </Reveal>

      <Reveal step={2} className="mt-4">
        <p className="w-[1010px] text-lg leading-snug text-white/85">
          None of this made the software cleverer. It made it{" "}
          <Accent>usable by the people who asked for it</Accent>.
        </p>
      </Reveal>

      <Footnote>
        Simple Mode from 14 August 2026; mobile audits August and September
        2026.
      </Footnote>
    </Shell>
  );
}
