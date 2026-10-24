"use client";

import { useRef } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { animate, m, useMotionValue } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  projectVelocity,
} from "@vvedantb/ui";

export type GalleryImage = { url: string; alt?: string };

/**
 * Controls (arrows, "open in new tab") opt out of the swipe surface: taking
 * pointer capture on the container retargets the resulting `click` to the
 * container, so a captured drag would swallow every button press.
 */
const CONTROL_SELECTOR = "[data-lightbox-control]";

/**
 * The single fullscreen image viewer: cycles with arrow keys, arrow buttons, or
 * a 1:1 touch/pointer swipe. Every surface that shows an image (chat galleries,
 * markdown images, the file viewer) opens this rather than a new tab.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: GalleryImage[];
  /** `null` while closed. */
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const offsetX = useMotionValue(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const samplesRef = useRef<Array<{ x: number; t: number }>>([]);

  const count = images.length;
  const current = index === null ? null : images[index];

  // Wrap-around so the user can circle through the set in either direction.
  const step = (delta: number) => {
    if (index === null || count === 0) return;
    onIndexChange((index + delta + count) % count);
    offsetX.set(0);
  };

  const sampleVelocity = (): number => {
    const samples = samplesRef.current;
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first === undefined || last === undefined) return 0;
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    return ((last.x - first.x) / dt) * 1000;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (count <= 1 || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest(CONTROL_SELECTOR) !== null
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    startXRef.current = event.clientX;
    samplesRef.current = [{ x: event.clientX, t: performance.now() }];
    offsetX.stop();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = event.clientX - startXRef.current;
    offsetX.set(dx);
    samplesRef.current = [
      ...samplesRef.current.slice(-4),
      { x: event.clientX, t: performance.now() },
    ];
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const dx = offsetX.get();
    const velocity = sampleVelocity();
    const projected = dx + projectVelocity(velocity);
    const goPrev = projected > 64 || velocity > 500;
    const goNext = projected < -64 || velocity < -500;

    if (goPrev || goNext) {
      const target =
        (goNext ? -1 : 1) * Math.max(280, window.innerWidth * 0.45);
      void animate(offsetX, target, {
        type: "spring",
        bounce: 0,
        duration: 0.35,
        velocity,
      }).then(() => step(goNext ? 1 : -1));
      return;
    }

    void animate(offsetX, 0, {
      type: "spring",
      bounce: 0,
      duration: 0.35,
      velocity,
    });
  };

  return (
    <Dialog
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) {
          offsetX.set(0);
          onClose();
        }
      }}
    >
      <DialogContent
        className="h-[92dvh] max-w-[96vw] overflow-hidden border-0 bg-black/90 p-0 shadow-none sm:max-w-[96vw]"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
      >
        <DialogTitle className="sr-only">
          {current?.alt ?? "Screenshot"}
        </DialogTitle>
        {current ? (
          <div
            className="relative flex h-full w-full touch-pan-y items-center justify-center"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <m.img
              src={current.url}
              alt={current.alt ?? "Screenshot"}
              draggable={false}
              style={{ x: offsetX }}
              className="max-h-full max-w-full select-none object-contain"
            />
            {count > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  data-lightbox-control=""
                  onClick={() => step(-1)}
                  className="max-sm:hit-target absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2 text-white motion-press active:scale-[0.94] hover:bg-black/70"
                >
                  <IconChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  data-lightbox-control=""
                  onClick={() => step(1)}
                  className="max-sm:hit-target absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2 text-white motion-press active:scale-[0.94] hover:bg-black/70"
                >
                  <IconChevronRight size={22} />
                </button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums text-white">
                  {index === null ? 1 : index + 1} / {count}
                </span>
              </>
            ) : null}
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              data-lightbox-control=""
              className="max-sm:hit-target absolute right-12 top-3 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-white/80 transition-colors hover:text-white"
            >
              <IconExternalLink size={14} />
              Open in new tab
            </a>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
