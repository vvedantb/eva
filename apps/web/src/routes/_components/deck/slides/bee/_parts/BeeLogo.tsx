import { useId } from "react";
import { m } from "motion/react";
import type { Transition } from "motion/react";

/**
 * Bee's mark, ported from the Bee app (`src/renderer/src/BeeLogo.tsx`): a
 * glossy honey orb with two stripes, glassy wings, antennae and pill eyes.
 * Drawn for a light stage (grey wings, as the app's `tone="light"`). The app
 * animates it in CSS; here the wings flutter and the eyes blink with Motion.
 */

const INK = "#2a1e0c";
const ANTENNA = "#d0901a";
const WINGS = {
  from: "#d4d4d8",
  fromOpacity: 0.9,
  to: "#cfcfd4",
  toOpacity: 0.6,
  stroke: "#8a8a92",
};

/** A wing beat every few seconds: out, back past rest, settle. */
const FLUTTER: Transition = {
  duration: 7,
  times: [0, 0.02, 0.04, 0.06, 0.08, 1],
  repeat: Infinity,
  ease: "easeInOut",
};

function Wing({ side, fill }: { side: "left" | "right"; fill: string }) {
  const flap = side === "left" ? -1 : 1;
  const cx = side === "left" ? 17.5 : 46.5;
  return (
    <m.g
      style={{
        transformBox: "view-box",
        transformOrigin: side === "left" ? "25px 19px" : "39px 19px",
      }}
      animate={{ rotate: [0, flap * 14, flap * -4, flap * 14, 0, 0] }}
      transition={FLUTTER}
    >
      <ellipse
        cx={cx}
        cy="15.5"
        rx="10"
        ry="5"
        transform={`rotate(${flap * 30} ${cx} 15.5)`}
        fill={fill}
        stroke={WINGS.stroke}
        strokeWidth="1"
      />
    </m.g>
  );
}

export function BeeLogo({
  size = 64,
  glow = true,
  className,
}: {
  size?: number;
  /** The soft honey halo behind the orb. */
  glow?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^\w-]/g, "");
  const ref = (part: string) => `bee-${uid}-${part}`;
  const url = (part: string) => `url(#${ref(part)})`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id={ref("glow")}>
          <stop offset="0.55" stopColor="#fabe28" stopOpacity="0.4" />
          <stop offset="1" stopColor="#fabe28" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id={ref("body")}
          cx="0.5"
          cy="0.5"
          r="0.5"
          fx="0.34"
          fy="0.28"
        >
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset="0.28" stopColor="#ffd75e" />
          <stop offset="0.68" stopColor="#fabe28" />
          <stop offset="1" stopColor="#e09a12" />
        </radialGradient>
        <radialGradient id={ref("shade")} cx="0.72" cy="0.8" r="0.62">
          <stop offset="0" stopColor="#b86b00" stopOpacity="0.45" />
          <stop offset="1" stopColor="#b86b00" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ref("spec")}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ref("rim")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8d6" stopOpacity="0.7" />
          <stop offset="0.55" stopColor="#fff8d6" stopOpacity="0.1" />
          <stop offset="1" stopColor="#fff2b0" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={ref("wing")} x1="0" y1="0" x2="1" y2="1">
          <stop
            offset="0"
            stopColor={WINGS.from}
            stopOpacity={WINGS.fromOpacity}
          />
          <stop offset="1" stopColor={WINGS.to} stopOpacity={WINGS.toOpacity} />
        </linearGradient>
        <clipPath id={ref("orb")}>
          <circle cx="32" cy="35" r="20" />
        </clipPath>
      </defs>

      {glow ? <circle cx="32" cy="35" r="29" fill={url("glow")} /> : null}
      <Wing side="left" fill={url("wing")} />
      <Wing side="right" fill={url("wing")} />
      <g
        fill={ANTENNA}
        stroke={ANTENNA}
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M28.5 17Q27.5 10.5 24.5 6.5" fill="none" />
        <path d="M35.5 17Q36.5 10.5 39.5 6.5" fill="none" />
        <circle cx="24.5" cy="6.5" r="2.2" stroke="none" />
        <circle cx="39.5" cy="6.5" r="2.2" stroke="none" />
      </g>
      <circle cx="32" cy="35" r="20" fill={url("body")} />
      {/* Stripes bow downward to follow the sphere. */}
      <g clipPath={url("orb")} fill={INK}>
        <path d="M10 36Q32 45 54 36V41Q32 50 10 41Z" />
        <path d="M10 45Q32 54 54 45V49.5Q32 58.5 10 49.5Z" />
        <circle cx="32" cy="35" r="20" fill={url("shade")} />
      </g>
      <ellipse
        cx="25"
        cy="23"
        rx="8"
        ry="6"
        transform="rotate(-30 25 23)"
        fill={url("spec")}
      />
      <circle
        cx="32"
        cy="35"
        r="19.4"
        fill="none"
        stroke={url("rim")}
        strokeWidth="1.2"
      />
      {/* A blink every few seconds. */}
      <m.g
        style={{ transformBox: "view-box", transformOrigin: "32px 29px" }}
        animate={{ scaleY: [1, 1, 0.1, 1] }}
        transition={{
          duration: 4.2,
          times: [0, 0.95, 0.975, 1],
          repeat: Infinity,
        }}
      >
        <rect x="23.6" y="24.5" width="5.4" height="9" rx="2.7" fill={INK} />
        <rect x="35" y="24.5" width="5.4" height="9" rx="2.7" fill={INK} />
        <g fill="#ffffff" opacity="0.9">
          <circle cx="25.6" cy="26.9" r="1.15" />
          <circle cx="37" cy="26.9" r="1.15" />
        </g>
      </m.g>
    </svg>
  );
}
