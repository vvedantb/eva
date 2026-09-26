import type { Icon } from "@tabler/icons-react";
import {
  IconAlertCircle,
  IconHelpCircle,
  IconMessageOff,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { MoA4IncidentCard } from "../_parts/MoA4IncidentCard";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, MaskedText } from "../../_components/motion";

/**
 * The camera leans towards whichever incident has just landed, left then
 * centre then right, and pulls back as the closing line takes over.
 */
const PEOPLE_SHOTS: readonly CameraShot[] = [
  { rotateY: 6, translateZ: 20, x: 30 },
  { translateZ: 20 },
  { rotateY: -6, translateZ: 20, x: -30 },
  { translateZ: -40, scale: 0.96 },
];

interface Incident {
  icon: Icon;
  heading: string;
  date: string;
}

/** Left to right, one per build step, in the order they were found. */
const INCIDENTS: readonly Incident[] = [
  { icon: IconAlertCircle, heading: "Two hours, no reply", date: "Aug" },
  { icon: IconMessageOff, heading: "Two messages dropped", date: "Sep" },
  { icon: IconHelpCircle, heading: "Broken after resume", date: "Aug" },
];

export function AnnualPeople() {
  const step = useDeckStep();
  const closing = step >= 3;
  // Nobody is live once the closing line takes over.
  const newest = closing ? -1 : step;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>People · Working with others</Kicker>
        <Title size="md">Their problems set the agenda.</Title>
      </Reveal>

      <Camera shots={PEOPLE_SHOTS} className="mt-20">
        <m.div
          className="flex origin-center items-stretch justify-center"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={
            closing
              ? { scale: 0.9, y: -12, opacity: 0.6 }
              : { scale: 1, y: 0, opacity: 1 }
          }
          transition={{ duration: DUR.hero, ease: EASE.expo }}
        >
          {INCIDENTS.map((incident, index) => (
            <MoA4IncidentCard
              key={incident.heading}
              icon={incident.icon}
              heading={incident.heading}
              date={incident.date}
              index={index}
              step={step}
              newest={newest}
            />
          ))}
        </m.div>
      </Camera>

      <div className="mt-16 text-center">
        <p className="text-3xl text-white/90">
          <MaskedText step={3} delay={0.2}>
            Every one of these came from <Accent>a colleague</Accent>, not a
            test.
          </MaskedText>
        </p>
        <Reveal step={3} delay={0.75} distance={10}>
          <p className="mt-5 text-sm text-white/45">
            Each fixed, pinned by a test, and written down.
          </p>
        </Reveal>
      </div>

      <Footnote>
        Incidents from Eva&apos;s release notes, August and September 2026.
      </Footnote>
    </Shell>
  );
}
