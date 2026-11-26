import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";

const LABEL = "text-xs font-semibold tracking-[0.14em] text-white/45 uppercase";

interface Case {
  name: string;
  looked: string;
  took: string;
}

/** Four CarePulse changes from September to November 2026. One per build step. */
const CASES: readonly Case[] = [
  {
    name: "Provider homepage",
    looked: "A redesign and a few new features",
    took: "Questioning the AI on how every part works",
  },
  {
    name: "Central contact pages",
    looked: "A new overview page",
    took: "A steady stream of questions to Matt",
  },
  {
    name: "Never events",
    looked: "One more graph",
    took: "A backend change, merged first",
  },
  {
    name: "Jev PID checker",
    looked: "One prompt, now that it exists",
    took: "The trade-offs and decisions that got it there",
  },
];

export function AnnualUnderstanding() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          AI writes the code, not the <Accent>understanding</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-4 gap-4">
        {CASES.map((item, index) => (
          <Reveal key={item.name} step={index + 1}>
            {/* p-6 inside a 28px outer radius keeps the corners close to concentric. */}
            <Card className="flex h-[320px] flex-col rounded-[28px] p-6">
              <div className="text-xl font-semibold text-white">
                {item.name}
              </div>
              <div className="mt-5">
                <div className={LABEL}>Looked like</div>
                <div className="mt-2 text-lg leading-snug text-white/55">
                  {item.looked}
                </div>
              </div>
              <div className="mt-auto">
                <div className={LABEL}>Took</div>
                <div className="mt-2 text-lg leading-snug text-white">
                  {item.took}
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <p className="mt-10 text-3xl text-white/85">
        <MaskedText step={5} delay={0.1}>
          Understanding is what lets us stop reading every line
        </MaskedText>
      </p>
    </Shell>
  );
}
