import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../_components/DeckPrimitives";
import { ModelPickerMock } from "./_parts/ModelPickerMock";

export function Slide05SimpleMode() {
  return (
    <Shell className="py-10">
      <div className="flex flex-1 items-center gap-10">
        <div className="w-[420px] shrink-0">
          <Reveal from="none">
            <Kicker>Simple Mode</Kicker>
          </Reveal>
          <Reveal delay={0.1}>
            <Title size="md">One switch. Less machinery.</Title>
          </Reveal>
          <Reveal delay={0.25}>
            <Body className="text-lg">
              Simple Mode hides files, consoles, settings and meters, and leaves
              the conversation. Choosing a model went from a long list to one
              slider.
            </Body>
          </Reveal>
          <Reveal step={1} className="mt-6">
            <p className="text-base leading-relaxed text-white/45">
              Cheaper and faster on the left. Strongest on the right. Nothing to
              configure.
            </p>
          </Reveal>
        </div>

        <div className="flex w-[600px] shrink-0 items-center justify-center">
          <ModelPickerMock />
        </div>
      </div>

      <Footnote>
        Simple Mode is an optional setting. Landed 14 August 2026; slider added
        24 August 2026.
      </Footnote>
    </Shell>
  );
}
