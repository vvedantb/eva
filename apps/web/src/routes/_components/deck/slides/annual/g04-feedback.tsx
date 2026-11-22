import {
  IconArrowRight,
  IconMessageCircle,
  IconSearch,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";

interface Stage {
  icon: ReactNode;
  label: string;
  name: string;
  detail: string;
}

/**
 * The feedback loop. Capture and review shipped on 3 November 2026 (thumbs on
 * every turn, the agent's submit_feedback tool and the Feedback page); the
 * third stage is the plan, so it is labelled Next.
 */
const STAGES: readonly Stage[] = [
  {
    icon: <IconMessageCircle size={26} stroke={1.6} />,
    label: "Captured",
    name: "Feedback left automatically",
    detail: "Eva reads how people react in chat and records it",
  },
  {
    icon: <IconSearch size={26} stroke={1.6} />,
    label: "Reviewed",
    name: "We own the data",
    detail: "What went wrong, what to add, what to simplify",
  },
  {
    icon: <IconShieldCheck size={26} stroke={1.6} />,
    label: "Next",
    name: "New lints and Jev checks",
    detail: "So the agent writes code we are happy to merge",
  },
];

export function AnnualFeedback() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">
          Every chat <Accent>teaches Eva</Accent>
        </Title>
      </Reveal>

      <div className="mt-12 flex items-center gap-3">
        {STAGES.flatMap((stage, index) => [
          ...(index > 0
            ? [
                <Reveal key={`${stage.label}-arrow`} step={index + 1}>
                  <IconArrowRight
                    size={24}
                    className="text-white/35"
                    aria-hidden
                  />
                </Reveal>,
              ]
            : []),
          <Reveal key={stage.label} step={index + 1} className="flex-1">
            {/* p-7 inside a 28px outer radius keeps the corners concentric. */}
            <Card className="flex h-[300px] flex-col rounded-[28px] p-7">
              <div className="flex items-center gap-3 text-white/80">
                {stage.icon}
                <span className="text-sm font-semibold tracking-[0.14em] text-white/45 uppercase">
                  {stage.label}
                </span>
              </div>
              <div className="mt-auto text-2xl leading-snug font-semibold text-white">
                {stage.name}
              </div>
              <div className="mt-3 h-[56px] text-lg leading-snug text-white/65">
                {stage.detail}
              </div>
            </Card>
          </Reveal>,
        ])}
      </div>
    </Shell>
  );
}
