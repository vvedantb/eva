import {
  IconGitMerge,
  IconGitPullRequestDraft,
  IconHandClick,
  IconMoonStars,
  IconRobot,
  IconRocket,
} from "@tabler/icons-react";
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
  useDeckStep,
} from "../_components/DeckPrimitives";
import { PipelineConnector, PipelineNode } from "./_parts/Pipeline";

const ICON_SIZE = 26;

/** Nightly routines, in the order they run. */
const ROUTINES = [
  "Find critical bugs",
  "Add test coverage",
  "Generate docs",
  "Improve code structure",
  "Code quality review",
  "Daily standup 08:00",
];

export function Slide06Automerge() {
  const step = useDeckStep();
  const running = step >= 1;

  return (
    <Shell className="py-14">
      <Kicker>Grok bot automations</Kicker>
      <Title size="md">Changes that ship themselves.</Title>
      <Body className="mt-4 max-w-3xl">
        One click from a person. Everything after that is automatic.
      </Body>

      <div className="mt-10 flex items-stretch">
        <PipelineNode
          icon={<IconGitPullRequestDraft size={ICON_SIZE} />}
          label="Eva drafts the change"
          sub="a bundle of changes"
          active
        />
        <PipelineConnector active delay={0.3} />
        <PipelineNode
          icon={<IconHandClick size={ICON_SIZE} />}
          label="You mark it ready"
          sub="the only human step"
          active
          glow
          pulse={!running}
        />
        <PipelineConnector active={running} delay={0} />
        <PipelineNode
          icon={<IconRobot size={ICON_SIZE} />}
          label="Grok bot wakes up"
          sub="no waiting around"
          active={running}
          delay={0.5}
        />
        <PipelineConnector active={running} delay={0.9} />
        <PipelineNode
          icon={<IconGitMerge size={ICON_SIZE} />}
          label="Merged into main"
          sub="straight into the codebase"
          active={running}
          delay={1.4}
        />
        <PipelineConnector active={running} delay={1.8} />
        <PipelineNode
          icon={<IconRocket size={ICON_SIZE} />}
          label="Live in production"
          sub="deployed for everyone"
          active={running}
          delay={2.3}
          flash
        />
      </div>

      <Reveal step={2} className="mt-8">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-white/85">
            <IconMoonStars size={18} />
            And while you sleep
          </div>
          <Stagger
            step={2}
            staggerChildren={0.06}
            className="mt-3 flex flex-wrap gap-2"
          >
            {ROUTINES.map((routine) => (
              <StaggerItem
                key={routine}
                className="rounded-full bg-white/[0.07] px-3 py-1 text-sm"
              >
                {routine}
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-3 text-xs text-white/45">
            Nightly routines that open their own bundles of changes, ready for
            you to review in the morning.
          </div>
        </Card>
      </Reveal>

      <Footnote>
        Auto-merge workflow landed 3 September 2026. Always-on checks were
        retired in August: the agent had already checked its work in the
        sandbox.
      </Footnote>
    </Shell>
  );
}
