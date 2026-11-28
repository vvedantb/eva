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

interface Skill {
  name: string;
  credit?: string;
}

const SKILLS: readonly Skill[] = [
  { name: "Effect" },
  { name: "Tables" },
  { name: "Permissions" },
  { name: "Filters" },
  { name: "RPC" },
  { name: "Backend calls" },
];

const DESIGN: Skill = { name: "Design review", credit: "Made by Zuza" };

function SkillCard({
  skill,
  at,
  on,
}: {
  skill: Skill;
  at: number;
  on: boolean;
}) {
  return (
    <m.div
      initial={{ opacity: 0.25, y: 10 }}
      animate={on ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 10 }}
      transition={{ duration: DUR.slow, ease: EASE.expo, delay: at }}
    >
      <Card className="flex h-[88px] items-center justify-between rounded-[20px] px-6">
        <span className="text-2xl font-semibold text-white">{skill.name}</span>
        {skill.credit ? (
          <span className="rounded-full bg-white/[0.08] px-3 py-1 text-sm text-white/70">
            {skill.credit}
          </span>
        ) : null}
      </Card>
    </m.div>
  );
}

export function AnnualSkills() {
  const step = useDeckStep();
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Teaching the agent <Accent>our codebase</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-3 gap-4">
        {SKILLS.map((skill, index) => (
          <SkillCard
            key={skill.name}
            skill={skill}
            on={step >= 1}
            at={index * 0.08}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <SkillCard skill={DESIGN} on={step >= 2} at={0} />
      </div>

      <Reveal step={3}>
        <p className="mt-10 text-3xl text-white/85">
          The agent writes code the way the team would
        </p>
      </Reveal>
    </Shell>
  );
}
