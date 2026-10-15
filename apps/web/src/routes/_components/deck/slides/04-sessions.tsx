import { Footnote, Reveal, Shell, Title } from "../_components/DeckPrimitives";
import { SessionsTimeline } from "./_parts/SessionsTimeline";

export function Slide04Sessions() {
  return (
    <Shell className="py-12">
      <Reveal delay={0.1}>
        <Title size="md">Sessions grew up.</Title>
      </Reveal>

      <div className="my-auto">
        <SessionsTimeline />
      </div>

      <Footnote>
        Dates are when each change landed in Eva&rsquo;s main branch.
      </Footnote>
    </Shell>
  );
}
