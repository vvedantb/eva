import { CountUp } from "../_components/CountUp";
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
} from "../_components/DeckPrimitives";
import { CloudVisual } from "./_parts/cloud-visual";

export function Slide03Cloud() {
  return (
    <Shell>
      <div className="grid grid-cols-[480px_560px] items-center gap-10">
        <div>
          <Reveal>
            <Kicker>Where the work happens</Kicker>
            <Title size="md">Nothing was built on a laptop.</Title>
            <Body className="text-lg">
              Every change in the last three months was written, tested and
              shipped from a browser tab. Eva does the work inside its own cloud
              workspaces.
            </Body>
          </Reveal>

          <Stagger
            step={2}
            delayChildren={0.1}
            staggerChildren={0.1}
            className="mt-10 grid grid-cols-3 gap-3"
          >
            <StaggerItem className="h-full">
              <Card className="h-full p-4">
                <div className="text-3xl font-semibold tracking-[-0.03em] whitespace-nowrap text-white">
                  <CountUp value={346} step={2} duration={1.2} delay={0.2} />
                </div>
                <div className="mt-2 text-xs leading-snug text-white/55">
                  changes authored by Eva itself
                </div>
              </Card>
            </StaggerItem>
            <StaggerItem className="h-full">
              <Card className="h-full p-4">
                <div className="text-3xl font-semibold tracking-[-0.03em] whitespace-nowrap text-white">
                  <CountUp value={33} step={2} duration={1.2} delay={0.3} />
                </div>
                <div className="mt-2 text-xs leading-snug text-white/55">
                  bundles of work Eva opened and finished on its own since
                  August
                </div>
              </Card>
            </StaggerItem>
            <StaggerItem className="h-full">
              <Card className="h-full p-4">
                <div className="text-3xl font-semibold tracking-[-0.03em] whitespace-nowrap text-white">
                  10 &rarr; 23
                </div>
                <div className="mt-2 text-xs leading-snug text-white/55">
                  of those in all of August, then in the first ten days of
                  September
                </div>
              </Card>
            </StaggerItem>
          </Stagger>
        </div>

        <div className="h-[560px]">
          <CloudVisual />
        </div>
      </div>

      <Footnote>
        <Reveal step={2} delay={0.5}>
          Counted from the author recorded on each change in the project&rsquo;s
          history.
        </Reveal>
      </Footnote>
    </Shell>
  );
}
