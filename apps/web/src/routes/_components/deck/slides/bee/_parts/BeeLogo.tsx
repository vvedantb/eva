import { useId } from "react";
import type { CSSProperties } from "react";
import { cn } from "@eva/ui";
import {
  EIGHT,
  ORBIT,
  blinkTiming,
  eightAt,
  logoDetail,
  logoMotion,
  logoMotionCss,
  orbitAt,
  trailTurn,
} from "./beeLogoMotion";
import type { LogoState } from "./beeLogoMotion";
import "./beeLogo.css";

export type { LogoState };

const INK = "#2a1e0c";
const HEX = "50,37 57.79,41.5 57.79,50.5 50,55 42.21,50.5 42.21,41.5";
const SPARK =
  "M0 -4.5Q0.7 -0.7 4.5 0Q0.7 0.7 0 4.5Q-0.7 0.7 -4.5 0Q-0.7 -0.7 0 -4.5Z";
// Generated once; React hoists the <style> by href, so many logos share one copy.
const MOTION_CSS = logoMotionCss();
// Amber, not ink, so the antennae read on the dark surface and on white.
const ANTENNA = "#d0901a";
// Glassy white wings vanish on a light background, so `tone="light"` draws them grey with a darker outline.
const WINGS = {
  dark: {
    from: "#ffffff",
    fromOpacity: 0.55,
    to: "#fff4d0",
    toOpacity: 0.12,
    stroke: "#ffffff",
    strokeOpacity: 0.7,
  },
  light: {
    from: "#d4d4d8",
    fromOpacity: 0.9,
    to: "#cfcfd4",
    toOpacity: 0.6,
    stroke: "#8a8a92",
    strokeOpacity: 1,
  },
};

/**
 * Bee's mark, ported from the Bee app (`src/renderer/src/BeeLogo.tsx`): a
 * glossy honey orb with two stripes, glassy wings, antennae and pill eyes.
 * Motion is CSS only (`beeLogo.css`, plus generated paths from
 * `beeLogoMotion.ts`): one pose and set of extras per `state`, as in the app.
 * `tone` is the background the mark sits on; `glow` turns the honey halo off.
 */
export function BeeLogo({
  size = 64,
  state = "idle",
  tone = "light",
  glow = true,
  className,
}: {
  size?: number;
  state?: LogoState;
  tone?: "dark" | "light";
  /** The soft honey halo behind the orb. */
  glow?: boolean;
  className?: string;
}) {
  // useId holds characters that are awkward inside url(#…).
  const uid = useId().replace(/[^\w-]/g, "");
  const ref = (part: string) => `bee-${uid}-${part}`;
  const detail = logoDetail(size);
  const blink = blinkTiming(uid);
  const timing = { animationDelay: `${blink.delayS}s` };
  const wings = WINGS[tone];
  const shown = state;
  const motion = logoMotion(size);
  const vars: CSSProperties & Record<`--${string}`, string | number> = {
    "--blink-delay": `${blink.delayS}s`,
    "--level": 0.5,
    "--ring-gain": motion.ringGain,
    "--echo-scale": motion.echoScale,
    "--eight-x": `${motion.eightX}px`,
    "--eight-y": `${motion.eightY}px`,
    "--orbit-x": `${motion.orbitX}px`,
    "--loop-r": `${motion.loopR}px`,
    "--mute": `url(#${ref("mute")})`,
    // A sub-pixel blur is invisible in the tiny view, so it is not paid for there.
    ...(detail.glow ? { "--blur": `url(#${ref("blur")})` } : {}),
  };
  const halo =
    glow && detail.glow ? (
      <circle
        className="bee-logo-glow"
        cx="32"
        cy="35"
        r="29"
        fill={`url(#${ref("glow")})`}
      />
    ) : null;
  const orbit = (layer: "front" | "back") => (
    <g className={`bee-fx-orbit ${layer}`} fill="#ffd75e">
      {[0, 1, 2].map((k) => (
        <circle
          key={k}
          cx="32"
          cy="35"
          r="1.9"
          style={{
            ...orbitAt(k / 3 + 0.08, layer),
            animationDelay: `${-((k / 3) * ORBIT.periodS).toFixed(2)}s`,
          }}
        />
      ))}
    </g>
  );
  const art = (
    <g className="bee-logo-art">
      <g className="bee-logo-wing left">
        <ellipse
          cx="17.5"
          cy="15.5"
          rx="10"
          ry="5"
          transform="rotate(30 17.5 15.5)"
          fill={`url(#${ref("wing")})`}
          stroke={wings.stroke}
          strokeOpacity={wings.strokeOpacity}
          strokeWidth="1"
        />
      </g>
      <g className="bee-logo-wing right">
        <ellipse
          cx="46.5"
          cy="15.5"
          rx="10"
          ry="5"
          transform="rotate(-30 46.5 15.5)"
          fill={`url(#${ref("wing")})`}
          stroke={wings.stroke}
          strokeOpacity={wings.strokeOpacity}
          strokeWidth="1"
        />
      </g>
      {detail.antennae ? (
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
      ) : null}
      <circle cx="32" cy="35" r="20" fill={`url(#${ref("body")})`} />
      {/* Stripes bow downward to follow the sphere. */}
      <g clipPath={`url(#${ref("orb")})`} fill={INK}>
        <path d="M10 36Q32 45 54 36V41Q32 50 10 41Z" />
        <path d="M10 45Q32 54 54 45V49.5Q32 58.5 10 49.5Z" />
        <circle cx="32" cy="35" r="20" fill={`url(#${ref("shade")})`} />
        {detail.grain ? (
          <rect
            x="12"
            y="15"
            width="40"
            height="40"
            filter={`url(#${ref("grain")})`}
            opacity="0.18"
          />
        ) : null}
      </g>
      <ellipse
        cx="25"
        cy="23"
        rx="8"
        ry="6"
        transform="rotate(-30 25 23)"
        fill={`url(#${ref("spec")})`}
      />
      <circle
        cx="32"
        cy="35"
        r="19.4"
        fill="none"
        stroke={`url(#${ref("rim")})`}
        strokeWidth="1.2"
      />
      <g
        className="bee-logo-eyes"
        style={{ ...timing, animationDuration: `${blink.periodS}s` }}
      >
        <rect x="23.6" y="24.5" width="5.4" height="9" rx="2.7" fill={INK} />
        <rect x="35" y="24.5" width="5.4" height="9" rx="2.7" fill={INK} />
        {detail.catchlights ? (
          <g fill="#ffffff" opacity="0.9">
            <circle cx="25.6" cy="26.9" r="1.15" />
            <circle cx="37" cy="26.9" r="1.15" />
          </g>
        ) : null}
      </g>
    </g>
  );
  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={cn("bee-logo animated", className)}
      data-state={shown}
      style={vars}
      width={size}
      height={size}
      viewBox={motion.viewBox}
      aria-hidden
      focusable="false"
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
            stopColor={wings.from}
            stopOpacity={wings.fromOpacity}
          />
          <stop offset="1" stopColor={wings.to} stopOpacity={wings.toOpacity} />
        </linearGradient>
        <clipPath id={ref("orb")}>
          <circle cx="32" cy="35" r="20" />
        </clipPath>
        {detail.grain ? (
          <filter id={ref("grain")} x="0" y="0" width="1" height="1">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.02  0 0 0 0.9 0" />
          </filter>
        ) : null}
        {shown === "error" ? (
          <filter
            id={ref("mute")}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix type="saturate" values="0.2" />
            <feComponentTransfer>
              <feFuncR type="linear" slope="0.7" />
              <feFuncG type="linear" slope="0.7" />
              <feFuncB type="linear" slope="0.7" />
            </feComponentTransfer>
          </filter>
        ) : null}
        {shown === "thinking" && detail.glow ? (
          <filter id={ref("blur")} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.45" />
          </filter>
        ) : null}
        {shown === "tool" ? (
          <>
            <clipPath id={ref("hex")}>
              <polygon points={HEX} />
            </clipPath>
            <linearGradient id={ref("honey")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd75e" />
              <stop offset="1" stopColor="#e09a12" />
            </linearGradient>
          </>
        ) : null}
      </defs>
      <>
        {shown === "listening" ? (
          <g fill="none" stroke="#fabe28">
            <circle
              className="bee-fx-ring echo"
              cx="32"
              cy="35"
              r={motion.ringR}
              strokeWidth="1"
            />
            <circle
              className="bee-fx-ring level"
              cx="32"
              cy="35"
              r={motion.ringR}
              strokeWidth="1.4"
            />
          </g>
        ) : null}
        {shown === "searching" ? (
          <g className="bee-fx-trail" fill="#fabe28">
            {Array.from({ length: EIGHT.dots - 1 }, (_, i) => i + 1).map(
              (k) => (
                <circle
                  key={k}
                  cx="32"
                  cy="35"
                  r={(1.6 - k * 0.1).toFixed(2)}
                  opacity={(0.7 - k * 0.07).toFixed(2)}
                  style={{
                    ...eightAt(trailTurn(k)),
                    animationDelay: `${-(EIGHT.periodS - k * EIGHT.lagS).toFixed(2)}s`,
                  }}
                />
              ),
            )}
          </g>
        ) : null}
        {shown === "tool" ? (
          <g>
            <polygon points={HEX} fill="#221e17" />
            <g clipPath={`url(#${ref("hex")})`}>
              <rect
                className="bee-fx-honey"
                x="41"
                y="36"
                width="18"
                height="19"
                fill={`url(#${ref("honey")})`}
              />
            </g>
            <polygon
              points={HEX}
              fill="none"
              stroke="#fabe28"
              strokeOpacity="0.85"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </g>
        ) : null}
        <g className="bee-flight">
          {halo}
          {shown === "thinking" ? orbit("back") : null}
          {art}
          {shown === "thinking" ? orbit("front") : null}
          {shown === "searching" ? (
            <g className="bee-fx-glass">
              <circle
                cx="50"
                cy="51"
                r="4.6"
                fill="#17140f"
                fillOpacity="0.55"
                stroke="#f4efe6"
                strokeWidth="1.9"
              />
              <path
                d="M53.3 54.3L57 58"
                stroke="#f4efe6"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </g>
          ) : null}
        </g>
        {shown === "done" ? (
          <g fill="#fff1b0">
            <g
              transform={`translate(${motion.sparkAt.x} ${motion.sparkAt.y}) scale(${motion.sparkAt.scale})`}
            >
              <path className="bee-fx-spark" d={SPARK} />
            </g>
            <g transform="translate(8 28) scale(0.65)">
              <path className="bee-fx-spark late" d={SPARK} />
            </g>
          </g>
        ) : null}
        {shown === "error" ? (
          <circle
            cx="52"
            cy="11"
            r="3.6"
            fill="#ff8a7a"
            stroke="#17140f"
            strokeWidth="1.6"
          />
        ) : null}
      </>
    </svg>
  );
  return (
    <>
      <style href="bee-logo-motion" precedence="default">
        {MOTION_CSS}
      </style>
      {svg}
    </>
  );
}
