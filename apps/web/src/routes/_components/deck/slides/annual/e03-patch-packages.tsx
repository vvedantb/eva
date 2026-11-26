import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";
import { MaskedText } from "../../_components/motion";
import { ProblemFix } from "../_parts/ProblemFix";

interface Patch {
  logo: string;
  name: string;
  problem: string;
  fix: string;
}

/** One package per build step. The patches themselves are cited in the notes. */
const PATCHES: readonly Patch[] = [
  {
    logo: "/brands/vercel-dark.svg",
    name: "Vercel Sandbox",
    problem: "Any command woke a stopped sandbox",
    fix: "An on-off switch, so Eva decides",
  },
  {
    logo: "/brands/convex.svg",
    name: "Convex presence",
    problem: "Every timeout threw and filled the logs",
    fix: "Skip the cancel when it runs itself",
  },
];

export function AnnualPatchPackages() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">When a package is wrong, patch it</Title>
      </Reveal>

      <div className="mt-10 flex flex-col gap-5">
        {PATCHES.map((patch, index) => (
          <Reveal key={patch.name} step={index + 1}>
            {/* p-7 inside a 28px outer radius keeps the corners concentric. */}
            <Card className="rounded-[28px] p-7">
              <div className="flex items-center gap-3">
                <img src={patch.logo} alt="" className="size-7" />
                <span className="text-2xl font-semibold text-white">
                  {patch.name}
                </span>
              </div>
              <ProblemFix
                problem={patch.problem}
                fix={patch.fix}
                step={index + 1}
              />
            </Card>
          </Reveal>
        ))}
      </div>

      <p className="mt-12 text-3xl text-white/85">
        <MaskedText step={3} delay={0.1}>
          A dependency is <Accent>code we can change</Accent>, not a wall
        </MaskedText>
      </p>
    </Shell>
  );
}
