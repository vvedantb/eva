import type { Icon } from "@tabler/icons-react";
import {
  IconAlertCircle,
  IconHelpCircle,
  IconMessageOff,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

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

/** The last incident to have landed. Earlier ones dim behind it. */
const LAST_CARD = INCIDENTS.length - 1;

export function AnnualPeople() {
  const step = useDeckStep();
  const newest = Math.min(step, LAST_CARD);

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Working with others</Kicker>
        <Title size="md">Their problems set the agenda.</Title>
      </Reveal>

      <m.div
        className="mt-20 flex origin-center items-stretch justify-center"
        animate={
          step >= 3 ? { scale: 0.86, opacity: 0.25 } : { scale: 1, opacity: 1 }
        }
        transition={{ type: "spring", bounce: 0, duration: 0.7 }}
      >
        {INCIDENTS.map((incident, index) => {
          const landed = step >= index;

          return (
            <div key={incident.heading} className="flex items-center">
              {index > 0 && (
                <m.div
                  aria-hidden
                  className="h-px w-[60px] origin-left rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: landed ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 }}
                />
              )}

              <m.div
                className="flex h-[180px] w-[300px] flex-col justify-between rounded-2xl bg-white/[0.05] p-6"
                initial={{ opacity: 0, y: 26, scale: 0.92 }}
                animate={{
                  opacity: landed ? (index < newest ? 0.5 : 1) : 0,
                  y: landed ? 0 : 26,
                  scale: landed ? 1 : 0.92,
                }}
                transition={{ type: "spring", bounce: 0, duration: 0.6 }}
              >
                <incident.icon
                  size={26}
                  stroke={1.6}
                  className="text-white/70"
                  aria-hidden
                />
                <div className="text-xl leading-snug font-semibold text-white">
                  {incident.heading}
                </div>
                <span className="self-start rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white/55">
                  {incident.date}
                </span>
              </m.div>
            </div>
          );
        })}
      </m.div>

      <Reveal step={3} className="mt-16 text-center">
        <p className="text-3xl text-white/90">
          Every one of these came from <Accent>a colleague</Accent>, not a test.
        </p>
        <p className="mt-5 text-sm text-white/45">
          Each fixed, pinned by a test, and written down.
        </p>
      </Reveal>

      <Footnote>
        Incidents from Eva&apos;s release notes, August and September 2026.
      </Footnote>
    </Shell>
  );
}
