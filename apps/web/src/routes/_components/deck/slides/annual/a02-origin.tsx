import { CountUp } from "../../_components/CountUp";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Accent,
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { AnnualOriginTimeline } from "../_parts/AnnualOriginTimeline";

/**
 * The camera dollies along the axis as the milestones arrive: pulled back and
 * slightly above the whole span, in towards the January cluster, right to the
 * summer beats, then square on while the closing figures count up.
 */
const ORIGIN_SHOTS: readonly CameraShot[] = [
  { rotateX: 6, translateZ: -50 },
  { rotateX: 4, translateZ: 10, x: -40 },
  { rotateX: 3, translateZ: 20, x: 40 },
  {},
];

export function AnnualOrigin() {
  return (
    <Shell className="py-12">
      <Reveal from="none">
        <Kicker>Where it started</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md">Eight months ago there was nothing.</Title>
      </Reveal>
      <Reveal delay={0.25}>
        <Body className="mt-4 max-w-4xl text-lg">
          Eva began as an empty repository on 11 January 2026. It now runs most
          of how we build software.
        </Body>
      </Reveal>

      <Camera shots={ORIGIN_SHOTS} className="mt-6">
        <AnnualOriginTimeline />
      </Camera>

      <Reveal step={3} delay={0.2}>
        <p className="text-lg text-white/85">
          In between,{" "}
          <Accent>
            <CountUp value={4732} step={3} delay={0.2} />
          </Accent>{" "}
          changes shipped and{" "}
          <Accent>
            <CountUp value={1348} step={3} delay={0.35} />
          </Accent>{" "}
          sets of release notes written.
        </p>
      </Reveal>

      <Footnote>
        Dates from Eva&rsquo;s own records and the project&rsquo;s history, to
        16 September 2026.
      </Footnote>
    </Shell>
  );
}
