import { cn } from "@eva/ui";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";
import { IntroTag, useIntroPalette } from "./_parts";

const STACK: readonly string[] = [
  "React",
  "Vite",
  "Convex",
  "TailwindCSS",
  "Clerk",
  "GitHub App",
  "Vercel Sandboxes",
  "TypeScript",
];

/**
 * The slide has no build steps, so the camera holds one position rather than
 * moving. The angle is small on purpose: enough for the row of tags to read as
 * a plane laid into the slide, not enough to thin the words out.
 */
const STACK_SHOTS: readonly CameraShot[] = [
  { rotateY: -7, rotateX: 4, translateZ: 20 },
];

export function IntroStack() {
  const palette = useIntroPalette();
  return (
    <Shell className={cn("justify-center", palette.surface)}>
      <Reveal>
        <Kicker className={palette.kicker}>Tech Stack</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title size="md" className={palette.title}>
          Built on proven foundations
        </Title>
      </Reveal>

      <Camera shots={STACK_SHOTS} className="mt-12">
        <Stagger
          delayChildren={0.3}
          staggerChildren={0.09}
          className="flex max-w-3xl flex-wrap gap-3"
        >
          {STACK.map((item) => (
            <StaggerItem key={item}>
              <IntroTag>{item}</IntroTag>
            </StaggerItem>
          ))}
        </Stagger>
      </Camera>
    </Shell>
  );
}
