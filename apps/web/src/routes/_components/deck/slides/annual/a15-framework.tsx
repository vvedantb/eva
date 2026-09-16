import { IconMinus } from "@tabler/icons-react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";

interface Capability {
  name: string;
  evidence: string;
}

/** Reading order: left to right, three per row. */
const CAPABILITIES: Capability[] = [
  {
    name: "Owns technical design",
    evidence: "Phased migration, written go or no-go",
  },
  {
    name: "Understands trade-offs",
    evidence: "Rejections recorded with their measurements",
  },
  {
    name: "Debugs without flailing",
    evidence: "Symptom, cause, test — three cases",
  },
  {
    name: "A skill beyond coding",
    evidence: "Performance measured, method and limits stated",
  },
  {
    name: "Breaks down large problems",
    evidence: "Six phases; two mobile rounds",
  },
  {
    name: "Improves the process",
    evidence: "Checks moved to where the work happens",
  },
  {
    name: "Mentors and onboards",
    evidence: "Four colleagues using it; rules written down",
  },
  {
    name: "Business and user empathy",
    evidence: "Simple Mode, plain-language summaries",
  },
  {
    name: "Identifies work to do",
    evidence: "The queue is the review; that is next year's plan",
  },
];

const GAPS = [
  "No page-score measurements in the routine yet, though the rig exists",
  "No formal on-call or incident grading — this is a one-person project",
  "No work alongside a designer or user researcher",
];

const CLOSERS = [
  "Page scores in the nightly routines",
  "A written release and rollback checklist",
  "Bring a colleague into the design step, not just the review",
];

export function AnnualFramework() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Against the framework</Kicker>
        <Title size="md">Senior engineer, mapped.</Title>
      </Reveal>

      <Stagger
        delayChildren={0.25}
        staggerChildren={0.06}
        className="mt-6 grid w-[1014px] grid-cols-3 gap-3"
      >
        {CAPABILITIES.map((capability) => (
          <StaggerItem key={capability.name}>
            <Card className="flex h-[62px] w-full flex-col justify-center p-3">
              <div className="text-sm leading-tight font-medium text-white">
                {capability.name}
              </div>
              <div className="mt-1 text-xs leading-tight text-white/50">
                {capability.evidence}
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-5 flex gap-3">
        <Reveal step={1}>
          <Card className="h-[190px] w-[501px] p-5">
            <div className="text-base font-semibold text-white">
              Where the evidence is thin
            </div>
            <Stagger
              step={1}
              delayChildren={0.2}
              staggerChildren={0.07}
              className="mt-3 flex flex-col gap-2"
            >
              {GAPS.map((gap) => (
                <StaggerItem key={gap} className="flex gap-2">
                  <IconMinus
                    size={16}
                    stroke={2}
                    className="mt-[3px] shrink-0 text-white/40"
                    aria-hidden
                  />
                  <span className="text-sm leading-snug text-white/60">
                    {gap}
                  </span>
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        </Reveal>

        <Reveal step={2}>
          <Card className="h-[190px] w-[501px] p-5">
            <div className="text-base font-semibold text-white">
              How to close those
            </div>
            <Stagger
              step={2}
              delayChildren={0.2}
              staggerChildren={0.07}
              className="mt-3 flex flex-wrap gap-2"
            >
              {CLOSERS.map((closer) => (
                <StaggerItem
                  key={closer}
                  className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80"
                >
                  {closer}
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        </Reveal>
      </div>

      <Reveal step={3} className="mt-4">
        <p className="w-[1014px] text-lg leading-snug text-white/85">
          The work is here to read:{" "}
          <Accent>
            <CountUp value={4705} step={3} />
          </Accent>{" "}
          changes,{" "}
          <Accent>
            <CountUp value={1348} step={3} />
          </Accent>{" "}
          sets of release notes, every decision written down at the time.
        </p>
      </Reveal>

      <Footnote>
        Evidence drawn from the repository and Eva&apos;s own records, 11
        January to 16 September 2026.
      </Footnote>
    </Shell>
  );
}
