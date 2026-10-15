import { IconCheck } from "@tabler/icons-react";
import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { BRAND, Connector, DUR, EASE, LEAVE } from "../../_components/motion";
import { FriTyped, FriWindow } from "./FriMock";

/** Pixel layout of the document body, so cursors, highlight and pin line up. */
const BODY_X = 24;
const BODY_Y = 57;
interface Bar {
  x: number;
  y: number;
  w: number;
  strong?: boolean;
}
const BARS: readonly Bar[] = [
  { x: 0, y: 46, w: 560 },
  { x: 0, y: 64, w: 480 },
  { x: 0, y: 82, w: 520 },
  { x: 0, y: 112, w: 440 },
  { x: 0, y: 130, w: 500 },
  { x: 0, y: 148, w: 380 },
  { x: 16, y: 182, w: 300, strong: true },
  { x: 16, y: 200, w: 250, strong: true },
];
/** The phrase the comment is anchored to: part of the fifth line. */
const ANCHOR = { x: 196, y: 130, w: 176 };

interface Cursor {
  name: string;
  colour: string;
  left: number;
  top: number;
  drift: number[];
}

/** Two people in the same paragraph, which is the whole point of the slide. */
const CURSORS: readonly Cursor[] = [
  {
    name: "Zuza",
    colour: BRAND.purple,
    left: 318,
    top: 102,
    drift: [0, 10, 0],
  },
  { name: "Eva", colour: BRAND.blue, left: 96, top: 168, drift: [0, -8, 0] },
];

function LiveCursor({ cursor, index }: { cursor: Cursor; index: number }) {
  const arrive = 0.9 + index * 0.25;
  return (
    <m.div
      className="absolute"
      style={{ left: cursor.left, top: cursor.top - 6 }}
      initial={{ opacity: 0, x: 36, y: 18 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: DUR.hero,
        ease: EASE.expo,
        delay: arrive,
        opacity: { duration: DUR.base, delay: arrive },
      }}
    >
      <m.div
        className="flex items-start"
        animate={{ x: cursor.drift }}
        transition={{
          duration: 3.2,
          ease: "easeInOut",
          repeat: Infinity,
          delay: arrive + 0.9,
        }}
      >
        <span
          aria-hidden
          className="h-5 w-[2px] rounded-full"
          style={{ backgroundColor: cursor.colour }}
        />
        <span
          className="ml-1 rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: cursor.colour }}
        >
          {cursor.name}
        </span>
      </m.div>
    </m.div>
  );
}

/** Where the pin sits, in the coordinates of the wrapper around the window. */
const PIN = { x: 520, y: 206 };

function CommentAnchor() {
  const anchored = useDeckStep() >= 1;
  const enter = (delay: number) =>
    anchored ? { duration: DUR.slow, ease: EASE.expo, delay } : LEAVE;

  return (
    <>
      <m.span
        aria-hidden
        className="absolute origin-left rounded-[4px]"
        style={{
          left: BODY_X + ANCHOR.x - 3,
          top: BODY_Y + ANCHOR.y - 5,
          width: ANCHOR.w + 6,
          height: 18,
          background: `linear-gradient(90deg, ${BRAND.purple}55, ${BRAND.blue}44)`,
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: anchored ? 1 : 0, opacity: anchored ? 1 : 0 }}
        transition={enter(0)}
      />
      {/* Hidden until its step: a round cap on an undrawn line still paints a dot. */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: anchored ? 1 : 0 }}
        transition={anchored ? { duration: DUR.fast, delay: 0.35 } : LEAVE}
      >
        <Connector
          step={1}
          delay={0.35}
          flow={false}
          bend={-18}
          from={{
            x: BODY_X + ANCHOR.x + ANCHOR.w + 6,
            y: BODY_Y + ANCHOR.y + 4,
          }}
          to={{ x: PIN.x - 4, y: PIN.y }}
          strokeWidth={1.5}
        />
      </m.div>
      <div
        className="absolute flex items-center gap-2.5"
        style={{ left: PIN.x, top: PIN.y - 14 }}
      >
        <m.span
          className="size-7 shrink-0 rounded-full bg-gradient-to-br from-[#8B3FB8] to-[#3B7DD8]"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: anchored ? 1 : 0, scale: anchored ? 1 : 0.4 }}
          transition={enter(0.75)}
        />
        <m.span
          className="flex items-center gap-1.5 rounded-[12px] bg-white/[0.1] px-3 py-1.5 text-[12px] whitespace-nowrap text-white/80"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: anchored ? 1 : 0, x: anchored ? 0 : -10 }}
          transition={enter(0.9)}
        >
          Agree, resolved
          <m.span
            className="text-emerald-300"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: anchored ? 1 : 0, scale: anchored ? 1 : 0.5 }}
            transition={enter(1.35)}
          >
            <IconCheck size={13} stroke={2.2} />
          </m.span>
        </m.span>
      </div>
    </>
  );
}

/** The shared document: typed heading, two paragraphs, a short list. */
export function MoF1Document() {
  return (
    <div className="relative">
      <FriWindow
        label="Referral portal — plan"
        className="h-[330px] w-[700px]"
        bodyClassName="relative px-6 py-5"
      >
        <div className="text-lg font-medium text-white">
          <FriTyped text="Decline reasons" delay={0.5} duration={0.9} />
        </div>
        {BARS.map((bar, index) => (
          <m.span
            key={index}
            aria-hidden
            className="absolute h-2 origin-left rounded-[4px]"
            style={{
              left: BODY_X + bar.x,
              top: bar.y + 20,
              width: bar.w,
              background: bar.strong
                ? "rgba(255,255,255,0.12)"
                : "rgba(255,255,255,0.09)",
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: DUR.slow,
              ease: EASE.expo,
              delay: 0.35 + index * 0.05,
            }}
          />
        ))}
        {[182, 200].map((y) => (
          <span
            key={y}
            aria-hidden
            className="absolute size-1.5 rounded-full bg-white/30"
            style={{ left: BODY_X + 2, top: y + 21 }}
          />
        ))}
        {CURSORS.map((cursor, index) => (
          <LiveCursor key={cursor.name} cursor={cursor} index={index} />
        ))}
      </FriWindow>
      <CommentAnchor />
    </div>
  );
}
