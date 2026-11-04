"use client";

// useEffect: a one-shot requestAnimationFrame loop drawing to a canvas.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const PIECE_COUNT = 90;
const DURATION_MS = 1800;
/** The last share of the burst fades out instead of cutting. */
const FADE_FROM = 0.65;
const GRAVITY = 0.32;
const DRAG = 0.985;
/** Theme chart colours (RGB triplets), so the burst follows the user's accent. */
const COLOR_VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];
const FALLBACK_COLOR = "rgb(120 120 120)";

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  flutter: number;
  width: number;
  height: number;
  color: string;
}

function themeColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const colors = COLOR_VARS.map((name) => style.getPropertyValue(name).trim())
    .filter((value) => value.length > 0)
    .map((value) => `rgb(${value})`);
  return colors.length > 0 ? colors : [FALLBACK_COLOR];
}

function spawnPieces(originX: number, originY: number): Piece[] {
  const colors = themeColors();
  return Array.from({ length: PIECE_COUNT }, (_, index) => {
    // A fan pointing down and out of the header, wider than it is deep.
    const angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 6 + Math.random() * 9;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6 - 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.4,
      flutter: Math.random() * Math.PI * 2,
      width: 5 + Math.random() * 5,
      height: 8 + Math.random() * 6,
      color: colors[index % colors.length] ?? FALLBACK_COLOR,
    };
  });
}

/**
 * One confetti burst from `anchor`, drawn on a full-window canvas that ignores
 * the pointer. Calls `onDone` when the last piece has faded.
 */
export function ConfettiBurst({
  anchor,
  onDone,
}: {
  anchor: HTMLElement;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    context.scale(ratio, ratio);

    const rect = anchor.getBoundingClientRect();
    const pieces = spawnPieces(rect.left + rect.width / 2, rect.bottom);
    const start = performance.now();
    let frame = 0;

    function draw(now: number) {
      if (!context) return;
      const progress = (now - start) / DURATION_MS;
      if (progress >= 1) {
        onDone();
        return;
      }
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      context.globalAlpha =
        progress < FADE_FROM ? 1 : 1 - (progress - FADE_FROM) / (1 - FADE_FROM);
      for (const piece of pieces) {
        piece.vx *= DRAG;
        piece.vy = piece.vy * DRAG + GRAVITY;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.angle += piece.spin;
        piece.flutter += 0.2;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        // Squash on one axis so each piece seems to turn over as it falls.
        context.scale(1, Math.cos(piece.flutter));
        context.fillStyle = piece.color;
        context.fillRect(
          -piece.width / 2,
          -piece.height / 2,
          piece.width,
          piece.height,
        );
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [anchor, onDone]);

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="confetti-burst"
      className="pointer-events-none fixed inset-0 z-50 size-full"
    />,
    document.body,
  );
}
