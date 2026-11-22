import { IconMinus } from "@tabler/icons-react";
import { m } from "motion/react";
import { MoA4CapabilityCard } from "../_parts/MoA4CapabilityCard";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, Sheen } from "../../_components/motion";

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
        proof: ["Decided on paper first", "Not tied to one supplier"],
      },
      {
        name: "Understands trade-offs",
        proof: ["Workspaces in under a second", "Knowing what to stop"],
      },
      {
        name: "Debugs without flailing",
        proof: ["The database was fighting itself", "Patch the package"],
      },
      {
        name: "A skill beyond coding",
        proof: ["Measure it, do not guess", "Jev"],
      },
    ],
  },
  {
    heading: "Impact",
    items: [
      {
        name: "Breaks down large problems",
        proof: ["Decided on paper first", "Finishing what it starts"],
      },
      {
        name: "Improves the process",
        proof: ["The bar is enforced", "Redline and shared packages"],
      },
      {
        name: "Identifies work to do",
        proof: ["One guard on every door", "The bottleneck has moved"],
      },
      {
        name: "Business and user empathy",
        proof: ["Simple Mode", "Jev PID checker"],
      },
    ],
  },
  {
    heading: "Collaboration",
    items: [
      {
        name: "Communicates clearly",
        proof: ["Friday sessions", "This deck"],
      },
      {
        name: "Gets buy-in",
        proof: ["The team took Eva up", "Built by the team"],
      },
      {
        name: "Mentors and onboards",
        proof: ["Their problems set the agenda", "Bee shared with the company"],
      },
    ],
  },
];

const THIN = [
  "Feedback and pairing not written down",
  "Page scores not routine",
  "No designer or researcher",
];

/**
 * The grid starts as a board seen from slightly above, then straightens as the
 * proof arrives under all eleven, read square on. It stays there for the thin
 * evidence.
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
  const thinIn = step >= 2;

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
          <div className="grid grid-cols-3 gap-3">
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

      {/* Grid, thin evidence and the closing line sit on one 40px rhythm, which
          leaves the closing line clear of the footnote. */}
      <div className="mt-8">
        <Reveal step={2}>
          <div className="text-xs font-medium tracking-[0.18em] text-white/35 uppercase">
            Thin evidence
          </div>
        </Reveal>
        <div className="mt-3 flex gap-3">
          {THIN.map((gap, index) => {
            const at = 0.2 + index * 0.1;
            return (
              <m.div
                key={gap}
                initial={false}
                animate={
                  thinIn
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 14, scale: 0.96 }
                }
                transition={
                  thinIn
                    ? { duration: DUR.slow, ease: EASE.expo, delay: at }
                    : { duration: DUR.fast }
                }
                className="flex items-center gap-2 rounded-full border border-dashed border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-white/50"
              >
                <m.span
                  className="flex"
                  initial={false}
                  animate={{ scaleX: thinIn ? 1 : 0 }}
                  transition={
                    thinIn
                      ? { duration: DUR.base, ease: EASE.out, delay: at + 0.25 }
                      : { duration: DUR.fast }
                  }
                >
                  <IconMinus size={15} stroke={2} aria-hidden />
                </m.span>
                {gap}
              </m.div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
