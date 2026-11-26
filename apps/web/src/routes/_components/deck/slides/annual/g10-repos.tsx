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

interface Codebase {
  name: string;
  what: string;
}

/** Every work codebase connected in Eva (list_repos, checked 22 November 2026). */
const CODEBASES: readonly Codebase[] = [
  { name: "Eva", what: "The platform itself" },
  { name: "CarePulse v3", what: "The current web app" },
  { name: "CarePulse v2", what: "The Django backend" },
  { name: "eProcurement", what: "Procurement lifecycle" },
  { name: "Cost model", what: "Pricing work" },
];

export function AnnualRepos() {
  const on = useDeckStep() >= 1;
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Every work codebase runs on <Accent>Eva</Accent>
        </Title>
      </Reveal>

      <div className="mt-12 grid grid-cols-5 gap-4">
        {CODEBASES.map((codebase, index) => (
          <m.div
            key={codebase.name}
            initial={{ opacity: 0.25, y: 12 }}
            animate={on ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 12 }}
            transition={{
              duration: DUR.slow,
              ease: EASE.expo,
              delay: on ? index * 0.1 : 0,
            }}
          >
            {/* p-6 inside a 24px outer radius keeps the corners concentric. */}
            <Card className="flex h-[180px] flex-col rounded-[24px] p-6">
              <div className="text-2xl font-semibold text-white">
                {codebase.name}
              </div>
              <div className="mt-auto text-lg leading-snug text-white/60">
                {codebase.what}
              </div>
            </Card>
          </m.div>
        ))}
      </div>
    </Shell>
  );
}
