import type { Icon } from "@tabler/icons-react";
import {
  IconAlertCircle,
  IconCheck,
  IconHelpCircle,
  IconMessageOff,
} from "@tabler/icons-react";
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

interface Incident {
  icon: Icon;
  heading: string;
  line: string;
  outcome: string;
}

/** Left to right, in the order they were found. */
const INCIDENTS: Incident[] = [
  {
    icon: IconAlertCircle,
    heading: "Two hours with no reply",
    line: "A colleague's messages went unanswered while a stuck process held a lock.",
    outcome: "Fixed and pinned by a test, August",
  },
  {
    icon: IconMessageOff,
    heading: "Two messages dropped",
    line: "A fix had landed for one part of the chat and not the other two.",
    outcome: "All three brought back into line, September",
  },
  {
    icon: IconHelpCircle,
    heading: "A question after resume",
    line: "Design tooling did not survive a workspace waking up.",
    outcome: "Found from a colleague's session, August",
  },
];

const WRITTEN_DOWN = [
  "Rules for the codebase, in the repository",
  "Guides for the interface, the data layer and security",
  "Ready-made commands the team can run",
  "Release notes written for every change",
];

const HANDLING = [
  "Incidents are written up with what was missed, not just what was fixed",
  "Entries state what is NOT covered as well as what is",
  "Rules are added to the repository so the same gap cannot reopen",
];

export function AnnualPeople() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Working with others</Kicker>
        <Title size="md">Their problems set the agenda.</Title>
        <Body className="mt-3 max-w-5xl text-base">
          Four colleagues use Eva regularly. When it fails them, the failure
          gets named, fixed and written down.
        </Body>
      </Reveal>

      <Stagger
        delayChildren={0.25}
        staggerChildren={0.1}
        className="mt-6 flex gap-6"
      >
        {INCIDENTS.map((incident) => (
          <StaggerItem key={incident.heading}>
            <Card className="flex h-[150px] w-[330px] flex-col p-5">
              <incident.icon size={22} stroke={1.6} className="text-white/70" />
              <div className="mt-2 text-base leading-tight font-semibold text-white">
                {incident.heading}
              </div>
              <div className="mt-2 text-sm leading-snug text-white/60">
                {incident.line}
              </div>
              <div className="mt-auto text-xs text-white/40">
                {incident.outcome}
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-5 flex gap-6">
        <Reveal step={1}>
          <Card className="h-[200px] w-[501px] p-5">
            <div className="text-base font-semibold text-white">
              Written down so others can follow
            </div>
            <Stagger
              step={1}
              delayChildren={0.2}
              staggerChildren={0.07}
              className="mt-3 flex flex-wrap gap-2"
            >
              {WRITTEN_DOWN.map((item) => (
                <StaggerItem
                  key={item}
                  className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-white/80"
                >
                  {item}
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        </Reveal>

        <Reveal step={2}>
          <Card className="h-[200px] w-[501px] p-5">
            <div className="text-base font-semibold text-white">
              How mistakes are handled
            </div>
            <Stagger
              step={2}
              delayChildren={0.2}
              staggerChildren={0.07}
              className="mt-3 flex flex-col gap-2"
            >
              {HANDLING.map((row) => (
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
      </div>

      <Reveal step={3} className="mt-5">
        <p className="w-[1038px] text-lg leading-snug text-white/85">
          A fix that lands on one surface and not the other two is{" "}
          <Accent>a regression waiting to happen</Accent>. That sentence is now
          a rule in the repository.
        </p>
      </Reveal>

      <Footnote>
        Incidents from Eva&apos;s release notes, August and September 2026.
      </Footnote>
    </Shell>
  );
}
