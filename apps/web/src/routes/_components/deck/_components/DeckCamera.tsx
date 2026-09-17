import type { ReactNode } from "react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import { useDeckStep } from "./DeckPrimitives";

/**
 * The viewing distance used everywhere in the deck. Smaller numbers exaggerate
 * the perspective; 1600px against a 1280×720 canvas keeps the depth readable
 * without the wide-angle distortion that makes a business deck look like a
 * showreel. `Deck` and `PresenterView` put it on the stage, and `Camera` puts
 * it on its own wrapper so a camera works wherever it is nested.
 */
export const STAGE_PERSPECTIVE = 1600;

/**
 * One camera position. Every field is optional, and anything left out resets to
 * neutral, so `{}` means "square on, no push". Angles are degrees, `translateZ`
 * and `x`/`y` are pixels in the 1280×720 canvas.
 */
export interface CameraShot {
  rotateX?: number;
  rotateY?: number;
  translateZ?: number;
  scale?: number;
  x?: number;
  y?: number;
}

interface CameraProps {
  children: ReactNode;
  /** One shot per build step. The last shot holds for any step beyond it. */
  shots: readonly CameraShot[];
  className?: string;
}

/** A camera settling into position: critically damped, never bouncy. */
const CAMERA_TRANSITION: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.9,
};

/**
 * Flies a group of slide content between declared positions as the presenter
 * steps through the build. A slide declares one `CameraShot` per step and the
 * camera interpolates between them; `Layer` children sitting at different
 * depths then separate as it rotates, which is where the parallax comes from.
 *
 * The wrapper owns the perspective rather than inheriting one from the stage.
 * A slide's content sits many levels below the canvas, and every level in
 * between would need `transform-style: preserve-3d` for an inherited
 * perspective to survive — and any one of them animating opacity or clipping
 * its overflow flattens the lot. Owning it here keeps the camera self-contained.
 */
export function Camera({ children, shots, className }: CameraProps) {
  const step = useDeckStep();
  const shot = shots[Math.min(step, shots.length - 1)] ?? {};

  return (
    <div
      className={className}
      style={{
        perspective: STAGE_PERSPECTIVE,
        perspectiveOrigin: "50% 50%",
      }}
    >
      <m.div
        className="h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{
          rotateX: shot.rotateX ?? 0,
          rotateY: shot.rotateY ?? 0,
          z: shot.translateZ ?? 0,
          scale: shot.scale ?? 1,
          x: shot.x ?? 0,
          y: shot.y ?? 0,
        }}
        transition={CAMERA_TRANSITION}
      >
        {children}
      </m.div>
    </div>
  );
}

interface LayerProps {
  children: ReactNode;
  /** Pixels towards the viewer. Negative sits behind the neutral plane. */
  depth?: number;
  className?: string;
}

/**
 * Parks its children at a fixed depth inside a `Camera`, so they slide against
 * each other as the camera rotates.
 *
 * Keep `depth` within roughly ±120px. The canvas is only 1280×720 and the
 * perspective is 1600px, so anything larger magnifies the layer enough to push
 * it through the slide edge, and negative extremes shrink it out of alignment
 * with the rest of the composition.
 */
export function Layer({ children, depth = 0, className }: LayerProps) {
  return (
    <m.div
      className={className}
      style={{ z: depth, transformStyle: "preserve-3d" }}
    >
      {children}
    </m.div>
  );
}
