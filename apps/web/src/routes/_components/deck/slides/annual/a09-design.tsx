import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import {
  Body,
  Card,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import type { AnnualPhase } from "../_parts/AnnualPhasePipeline";
import { AnnualPhasePipeline } from "../_parts/AnnualPhasePipeline";

/** The migration, in the order the phases shipped. */
const PHASES: readonly AnnualPhase[] = [
  { label: "Spike", date: "6 Jul" },
  { label: "Neutral contract", date: "6 Jul" },
  { label: "Old provider behind it", date: "6 Jul" },
  { label: "New provider", date: "7 Jul" },
  { label: "Switched over", date: "25 Jul" },
  { label: "Old code removed", date: "29 Jul" },
];

/** What the written spike concluded, good news and bad. */
const FINDINGS = [
  {
    icon: IconCheck,
    iconClass: "text-emerald-400/70",
    textClass: "text-white/85",
    text: "A 6GB workspace restores in about a third of a second",
  },
  {
    icon: IconAlertTriangle,
    iconClass: "text-white/40",
    textClass: "text-white/60",
    text: "Some features deliberately left for later, and said so at the time",
  },
];

/** Options that were considered, measured and then rejected. */
const REJECTED = [
  "7 abandoned plans kept in writing",
  "A faster effect rejected: measured 11% worse",
  "A caching trick rejected: 5× more painting",
];

const CARD_TITLE = "text-sm font-medium text-white/85";

export function AnnualDesign() {
  const running = useDeckStep() >= 1;

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Design</Kicker>
        <Title size="md">Decided on paper first.</Title>
        <Body className="mt-3 max-w-4xl text-lg">
          The biggest change of the year replaced the engine every workspace
          runs on. It shipped in phases, with a written go or no-go before any
          of it was built.
        </Body>
      </Reveal>

      <div className="mt-7">
        <AnnualPhasePipeline phases={PHASES} active={running} />
      </div>

      <div className="mt-6 flex items-stretch gap-6">
        <Reveal step={2} className="w-[532px]">
          <Card className="flex h-[206px] flex-col p-5">
            <div className={CARD_TITLE}>What the spike answered</div>
            <div className="mt-4 flex flex-col gap-3">
              {FINDINGS.map((finding) => (
                <div key={finding.text} className="flex items-start gap-3">
                  <finding.icon
                    size={18}
                    className={`mt-0.5 shrink-0 ${finding.iconClass}`}
                    aria-hidden
                  />
                  <span
                    className={`text-[15px] leading-snug ${finding.textClass}`}
                  >
                    {finding.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-auto pt-3 text-xs leading-snug text-white/45">
              The spike&apos;s conclusion was a written GO, with the numbers
              behind it.
            </div>
          </Card>
        </Reveal>

        <Reveal step={3} className="w-[532px]" from="right">
          <Card className="flex h-[206px] flex-col p-5">
            <div className={CARD_TITLE}>Options that lost, kept on purpose</div>
            <Stagger
              step={3}
              staggerChildren={0.08}
              className="mt-4 flex flex-col items-start gap-2"
            >
              {REJECTED.map((option) => (
                <StaggerItem
                  key={option}
                  className="rounded-full bg-white/[0.07] px-3 py-1 text-[13px] text-white/80"
                >
                  {option}
                </StaggerItem>
              ))}
            </Stagger>
            <div className="mt-auto pt-3 text-xs leading-snug text-white/45">
              Rejections are recorded with the measurement that killed them, so
              nobody re-litigates them from memory.
            </div>
          </Card>
        </Reveal>
      </div>

      <Footnote>
        Sandbox provider migration, 6 to 29 July 2026. Rejected options from the
        animation performance work, 5 September 2026.
      </Footnote>
    </Shell>
  );
}
