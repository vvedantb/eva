import { MoA4CapabilityCard } from "../_parts/MoA4CapabilityCard";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Sheen } from "../../_components/motion";

/**
 * The framework's three sections, one column each, read top to bottom. Each
 * capability carries two reminders of the slides that showed it; the full
 * mapping, with slide numbers, is in the speaker note.
 */
const SECTIONS: readonly {
  heading: string;
  items: readonly { name: string; proof: readonly string[] }[];
}[] = [
  {
    heading: "Technical",
    items: [
      {
        name: "Owns technical design",
        proof: [
          "Sandbox move planned in six phases",
          "4 providers, 21 models, one picker",
        ],
      },
      {
        name: "Understands trade-offs",
        proof: [
          "Workspace start: 40 s to under 1 s",
          "7 dropped plans kept in writing",
        ],
      },
      {
        name: "Debugs without flailing",
        proof: [
          "Write clashes: 6.7 a second to 1 a minute",
          "Patched Vercel Sandbox and Convex",
        ],
      },
      {
        name: "A skill beyond coding",
        proof: [
          "Coming up with ideas",
          "Finding problems to solve",
          "Performance optimisation, measured",
          "User experience and animation",
        ],
      },
    ],
  },
  {
    heading: "Impact",
    items: [
      {
        name: "Breaks down large problems",
        proof: [
          "Sandbox move: spike to switch in 3 weeks",
          "Stuck turns fixed once, at the cause",
        ],
      },
      {
        name: "Improves the process",
        proof: [
          "Eva: many agents in parallel, no conflicts",
          "vmem: a company brain",
          "Redline and flowtape experiments",
          "Work to make CI quicker",
          "A Mantine linter",
        ],
      },
      {
        name: "Identifies work to do",
        proof: [
          "Critical warnings 2 to 0, high 48 to 2",
          "Next: automate the release",
        ],
      },
      {
        name: "Business and user empathy",
        proof: [
          "Simple Mode: one 5-step model slider",
          "PID checker for referral brokers",
        ],
      },
    ],
  },
  {
    heading: "Collaboration",
    items: [
      {
        name: "Communicates clearly",
        proof: [
          "Demoed Eva at every dev stand-up, first two quarters",
          "Daily summaries and a weekly changelog for non-engineers",
          "Plans logged in Eva, specs saved in the codebase",
        ],
      },
      {
        name: "Gets buy-in",
        proof: ["Vercel Sandbox for Eva", "Claude usage for Bee"],
      },
      {
        name: "Mentors and onboards",
        proof: [
          "Set everyone up on Eva",
          "Answered quick task, session and MCP questions",
        ],
      },
    ],
  },
];

/**
 * The grid starts as a board seen from slightly above, then straightens as the
 * proof arrives under all eleven, read square on.
 */
const FRAMEWORK_SHOTS: readonly CameraShot[] = [
  { rotateX: 7, translateZ: -30 },
  {},
  {},
  {},
];

export function AnnualFramework() {
  const step = useDeckStep();
  const evidenced = step >= 1;

  return (
    <Shell className="py-10">
      <Reveal>
        <Title size="md">Senior engineer, mapped</Title>
      </Reveal>

      <Camera shots={FRAMEWORK_SHOTS} className="mt-8">
        {/* One band of light follows the ticks across the board. */}
        <Sheen
          step={1}
          delay={0.2}
          duration={1.3}
          className="-m-2 rounded-3xl p-2"
        >
          <div className="grid grid-cols-3 items-start gap-3">
            {SECTIONS.map((section, column) => (
              <div key={section.heading} className="flex flex-col gap-3">
                <div className="text-xs font-medium tracking-[0.18em] text-white/45 uppercase">
                  {section.heading}
                </div>
                {section.items.map((item, row) => (
                  <MoA4CapabilityCard
                    key={item.name}
                    name={item.name}
                    proof={item.proof}
                    index={row * SECTIONS.length + column}
                    evidenced={evidenced}
                  />
                ))}
              </div>
            ))}
          </div>
        </Sheen>
      </Camera>
    </Shell>
  );
}
