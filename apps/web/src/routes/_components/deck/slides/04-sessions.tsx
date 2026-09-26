import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
} from "../_components/DeckPrimitives";
import { SessionsTimeline } from "./_parts/SessionsTimeline";

export function Slide04Sessions() {
  return (
    <Shell className="py-12">
      <div className="h-[186px] shrink-0">
        <Reveal from="none">
          <Kicker>Using Eva · Sessions</Kicker>
        </Reveal>
        <Reveal delay={0.1}>
          <Title size="md">Sessions grew up.</Title>
        </Reveal>
        <Reveal delay={0.25}>
          <Body className="mt-4 max-w-3xl text-lg">
            One running conversation, now with the tools of a real workspace.
          </Body>
        </Reveal>
      </div>

      <SessionsTimeline />

      <Footnote>
        Dates are when each change landed in Eva&rsquo;s main branch.
      </Footnote>
    </Shell>
  );
}
