import { IconFileText, IconSwords } from "@tabler/icons-react";
import type { ReactNode } from "react";
import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

interface Parked {
  icon: ReactNode;
  name: string;
  what: readonly string[];
  learnt: string;
}

/** Two features built in Eva and parked. One card per build step. */
const PARKED: readonly Parked[] = [
  {
    icon: <IconSwords size={26} stroke={1.6} className="text-white/80" />,
    name: "Testing Arena",
    what: [
      "One agent tries to break the interface",
      "One agent examines the code for issues",
    ],
    learnt: "Needs heavy AI usage. Revisit when there is spare usage",
  },
  {
    icon: <IconFileText size={26} stroke={1.6} className="text-white/80" />,
    name: "Documents",
    what: ["One place for PRDs and docs", "Kept beside the work in Eva"],
    learnt: "Needs more work before it pays off",
  },
];

export function AnnualParked() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Built, then <Accent>parked</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-5">
        {PARKED.map((item, index) => (
          <Reveal key={item.name} step={index + 1}>
            {/* p-8 inside a 28px outer radius keeps the corners concentric. */}
            <Card className="flex h-[330px] flex-col rounded-[28px] p-8">
              <div className="flex items-center gap-3">
                {item.icon}
                <span className="text-2xl font-semibold text-white">
                  {item.name}
                </span>
              </div>
              <ul className="mt-6 flex flex-col gap-3">
                {item.what.map((line) => (
                  <li key={line} className="text-xl leading-snug text-white/80">
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <div className={LABEL}>What I learnt</div>
                <div className="mt-2 text-xl leading-snug text-white">
                  {item.learnt}
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <p className="mt-10 text-3xl text-white/85">
        <MaskedText step={3} delay={0.1}>
          Parked is not dropped: the idea waits for the right time
        </MaskedText>
      </p>
    </Shell>
  );
}
