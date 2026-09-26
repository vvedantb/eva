import { Camera } from "../_components/DeckCamera";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../_components/DeckPrimitives";
import { MaskedText, Spotlight } from "../_components/motion";
import { RealModelPicker } from "./_parts/RealModelPicker";

/** The light sits under the long list, then settles on the slider. */
const GLOW = [
  { x: 300, y: 300, size: 720 },
  { x: 300, y: 250, size: 620 },
];

/** A small push on the switch, so the simpler picker reads as the answer. */
const SHOTS = [{}, { translateZ: 18 }];

export function Slide05SimpleMode() {
  return (
    <Shell className="py-10">
      <div className="flex flex-1 items-center gap-10">
        <div className="w-[420px] shrink-0">
          <Reveal from="none">
            <Kicker>Using Eva · Simple Mode</Kicker>
          </Reveal>
          <Reveal delay={0.1}>
            <Title size="md">One switch. Less machinery.</Title>
          </Reveal>
          <Body className="text-lg">
            <MaskedText delay={0.45} stagger={0.04} duration={0.8}>
              Files, consoles and meters go. The conversation stays.
            </MaskedText>
          </Body>
          <p className="mt-6 text-base leading-relaxed text-white/45">
            <MaskedText step={1} delay={0.55} stagger={0.035} duration={0.8}>
              Cheaper and faster on the left. Strongest on the right. Nothing to
              configure.
            </MaskedText>
          </p>
        </div>

        <div className="relative isolate flex h-[600px] w-[600px] shrink-0 items-center justify-center">
          <Spotlight shots={GLOW} />
          <Camera shots={SHOTS}>
            <Reveal delay={0.35} from="right" distance={40}>
              <RealModelPicker />
            </Reveal>
          </Camera>
        </div>
      </div>

      <Footnote>
        Simple Mode is an optional setting. Landed 14 August 2026; slider added
        24 August 2026.
      </Footnote>
    </Shell>
  );
}
