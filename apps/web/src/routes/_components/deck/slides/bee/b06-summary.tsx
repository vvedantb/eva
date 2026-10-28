import { Shell, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { SummaryAfter, SummaryCard } from "./_parts/MeetingSummary";

const DECISIONS = 1;
const ACTIONS = 2;
const SAVED = 3;
const FORWARD = 4;

const SHOTS: readonly CameraShot[] = [
  { rotateY: -8, translateZ: -40, x: -60 },
  { rotateY: -4, x: -30 },
  { rotateY: 0 },
  { rotateY: 5, translateZ: -40, x: -90 },
  { rotateY: 6, translateZ: -50, x: -100 },
];

export function BeeSummary() {
  const step = useDeckStep();
  const saved = step >= SAVED;
  const forward = step >= FORWARD;

  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative flex h-[460px] w-[1088px] items-start gap-12">
          {/* The note Bee writes when the meeting ends. */}
          <SummaryCard
            decisions={step >= DECISIONS}
            actions={step >= ACTIONS}
          />

          {/* It goes back into your notes, and to anyone who missed it. */}
          <SummaryAfter saved={saved} forward={forward} />
        </div>
      </Camera>
    </Shell>
  );
}
