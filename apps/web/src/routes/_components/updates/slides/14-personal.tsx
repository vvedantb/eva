import { IconAdjustments } from "@tabler/icons-react";
import {
  Accent,
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
import { PersonalAppMock } from "./_parts/PersonalAppMock";

const SIMILAR: readonly string[] = [
  "Cursor background agents",
  "OpenAI Codex",
  "Claude Code on the web",
  "GitHub Copilot coding agent",
  "Google Jules",
  "Devin",
];

const OURS: readonly string[] = [
  "Built around our repos, data and rules",
  "New features in an afternoon, by anyone on the team",
  "Anything we do not use can go",
];

export function Slide14Personal() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Eva and everyone else</Kicker>
        <Title size="md">
          Same idea. <Accent>Ours to shape.</Accent>
        </Title>
        <Body className="mt-4 max-w-4xl text-lg">
          Cloud coding agents are becoming a category. Eva is the one we can
          bend to the way we work.
        </Body>
      </Reveal>

      <div className="mt-7 flex gap-6">
        <div className="w-[472px] shrink-0">
          <Card className="p-5">
            <div className="text-xs tracking-[0.18em] text-white/40 uppercase">
              Similar products
            </div>
            <Stagger delayChildren={0.3} className="mt-3 flex flex-wrap gap-2">
              {SIMILAR.map((name) => (
                <StaggerItem
                  key={name}
                  className="rounded-full bg-white/[0.07] px-3 py-1 text-xs text-white/80"
                >
                  {name}
                </StaggerItem>
              ))}
            </Stagger>
            <div className="mt-4 text-sm text-white/60">
              All good. None of them knows CarePulse, our team or our rules.
            </div>
          </Card>

          <Reveal step={1} className="mt-3">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <IconAdjustments size={18} className="text-white/70" />
                <span className="text-sm font-semibold text-white">
                  What Eva has that they do not
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {OURS.map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]" />
                    <span className="text-sm text-white/75">{item}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="w-[560px] shrink-0">
          <PersonalAppMock />
          <Reveal step={2} delay={0.8} className="mt-3">
            <p className="text-sm text-white/55">
              Remove what you never use. Add what only you need.
            </p>
          </Reveal>
        </div>
      </div>

      <Reveal step={3} className="mt-6">
        <p className="text-lg text-white/85">
          Notion began as a notes app and kept adding features most people never
          open. The future is software that fits <Accent>one person</Accent>,
          not everyone.
        </p>
      </Reveal>

      <Footnote>
        Product names are their owners' trademarks. Comparison reflects our own
        use, September 2026.
      </Footnote>
    </Shell>
  );
}
