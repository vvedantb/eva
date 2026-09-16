import type { Icon } from "@tabler/icons-react";
import {
  IconDeviceMobile,
  IconFileCode,
  IconGauge,
  IconGitBranch,
  IconInbox,
  IconLink,
  IconRobot,
  IconUserStar,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { motionSpring } from "@eva/ui";
import {
  Card,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../_components/DeckPrimitives";

interface Item {
  icon: Icon;
  title: string;
  description: string;
}

const ITEMS: Item[] = [
  {
    icon: IconUserStar,
    title: "Manager Ave",
    description: "A supervising agent that runs your other sessions for you.",
  },
  {
    icon: IconRobot,
    title: "Automations Hub",
    description: "Ready-made routines you install with one click.",
  },
  {
    icon: IconInbox,
    title: "Two-pane inbox",
    description: "Everything that needs you, in one place.",
  },
  {
    icon: IconDeviceMobile,
    title: "Works on your phone",
    description: "Every screen usable on a small screen.",
  },
  {
    icon: IconLink,
    title: "Rich link previews",
    description: "Figma, Linear, Sentry and PostHog links become chips.",
  },
  {
    icon: IconFileCode,
    title: "Edit files in the browser",
    description: "Open, change and save without leaving Eva.",
  },
  {
    icon: IconGauge,
    title: "94% lighter animations",
    description: "The shimmer effect now costs almost nothing to run.",
  },
  {
    icon: IconGitBranch,
    title: "Reads sibling repos",
    description: "Eva can look across your other codebases while it works.",
  },
];

export function Slide08More() {
  return (
    <Shell>
      <Reveal>
        <Kicker>Also shipped</Kicker>
        <Title>And a great deal more.</Title>
      </Reveal>

      <Stagger
        delayChildren={0.4}
        staggerChildren={0.07}
        className="mt-22 grid grid-cols-4 gap-4"
      >
        {ITEMS.map((item) => (
          <StaggerItem key={item.title}>
            <m.div whileHover={{ y: -3 }} transition={motionSpring}>
              <Card className="h-[152px] p-5">
                <item.icon size={22} stroke={1.6} className="text-white/70" />
                <div className="mt-4 text-lg font-semibold text-white">
                  {item.title}
                </div>
                <div className="mt-2 text-sm leading-snug text-white/55">
                  {item.description}
                </div>
              </Card>
            </m.div>
          </StaggerItem>
        ))}
      </Stagger>
    </Shell>
  );
}
