import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Spotlight } from "../../_components/motion";
import { MoF1PreviewFrame } from "../_parts/MoF1PreviewFrame";

/**
 * Square on while the frame walks its widths, then a slow push towards the
 * heading as the note drops on it. The push stays small so the frame clears
 * the footnote.
 */
const SHOTS: readonly CameraShot[] = [
  {},
  {},
  { scale: 1.035, x: 24, y: 4, rotateY: 2 },
];

export function FridayPreview() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Using Eva · Preview</Kicker>
        <Title size="md">See it before it is real.</Title>
        <Body className="mt-5 max-w-3xl">
          Click through a change before anyone agrees to it.
        </Body>
      </Reveal>

      <Reveal
        delay={0.15}
        className="relative isolate mt-8 flex justify-center"
      >
        {/* A soft light gathers behind the heading when the note lands on it. */}
        <Spotlight shots={[null, null, { x: 330, y: 110, size: 520 }]} />
        <Camera shots={SHOTS}>
          <MoF1PreviewFrame />
        </Camera>
      </Reveal>

      <Footnote>
        Click-to-comment and phone, tablet and desktop widths, 21 July 2026.
        Device toolbar with rotate and screenshot, 25 August 2026. Previews
        survive leaving the session, 14 August 2026.
      </Footnote>
    </Shell>
  );
}
