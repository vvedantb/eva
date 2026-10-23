import { Children, Fragment, isValidElement } from "react";
import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { MotionCueContext, useMotionCue } from "../deckContext";
import { ACCENT_SHEEN_LEAD, Accent, AccentText } from "../DeckAccent";
import type { AccentSlice } from "../DeckAccent";
import { DUR, EASE, STAGGER, cueTransition } from "./tokens";

/** A run of text inside one masked word: plain, or a slice of an `Accent`. */
interface Piece {
  text: string;
  slice?: AccentSlice;
}

type Unit =
  | { kind: "word"; pieces: Piece[] }
  | { kind: "node"; node: ReactNode }
  | { kind: "space" }
  | { kind: "break" };

function plainText(node: ReactNode): string | null {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    const parts = node.map(plainText);
    return parts.every((part) => part !== null) ? parts.join("") : null;
  }
  return null;
}

/**
 * Splits text on whitespace. Whitespace stays real text between the masks, so
 * wrapping and `text-balance` behave exactly as they did on the plain string.
 * Punctuation that touches the previous word ("one" + ".") joins its mask, so a
 * full stop can never wrap onto a line by itself.
 */
function pushText(text: string, out: Unit[], accentFrom?: number) {
  let offset = 0;
  const total = text.length;
  for (const token of text.split(/(\s+)/)) {
    if (token === "") continue;
    const start = offset;
    offset += token.length;
    if (/^\s+$/.test(token)) {
      if (out.at(-1)?.kind !== "space") out.push({ kind: "space" });
      continue;
    }
    const piece: Piece =
      accentFrom === undefined
        ? { text: token }
        : { text: token, slice: { start, length: token.length, total } };
    const last = out.at(-1);
    if (last?.kind === "word") last.pieces.push(piece);
    else out.push({ kind: "word", pieces: [piece] });
  }
}

function splitWords(children: ReactNode, out: Unit[] = []): Unit[] {
  for (const child of Children.toArray(children)) {
    if (typeof child === "string" || typeof child === "number") {
      pushText(String(child), out);
    } else if (isValidElement<{ children?: ReactNode }>(child)) {
      const text = plainText(child.props.children);
      if (child.type === Fragment) splitWords(child.props.children, out);
      else if (child.type === "br") out.push({ kind: "break" });
      else if (child.type === Accent && text !== null) pushText(text, out, 0);
      else out.push({ kind: "node", node: child });
    }
  }
  return out;
}

/** One entry per authored line: each child, with strings also split on "\n". */
function splitLines(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    typeof child === "string" ? child.split("\n") : [child],
  );
}

/** Room for descenders and overhangs, given back so the line box is unchanged. */
const WORD_MASK =
  "inline-block overflow-hidden align-bottom px-[0.06em] -mx-[0.06em] py-[0.12em] -my-[0.12em]";
const LINE_MASK = "block overflow-hidden py-[0.12em] -my-[0.12em]";

interface MaskProps {
  children: ReactNode;
  on: boolean;
  delay: number;
  duration: number;
  line: boolean;
}

/** One clipped unit. Its contents inherit the unit's cue, so an `Accent` inside sheens on time. */
function Mask({ children, on, delay, duration, line }: MaskProps) {
  return (
    <span className={line ? LINE_MASK : WORD_MASK}>
      <m.span
        className={line ? "block" : "inline-block"}
        initial={{ y: "110%" }}
        animate={{ y: on ? "0%" : "110%" }}
        transition={cueTransition(on, delay, { duration, ease: EASE.expo })}
      >
        <MotionCueContext value={{ on, delay }}>{children}</MotionCueContext>
      </m.span>
    </span>
  );
}

export interface MaskedTextProps {
  children: ReactNode;
  /** `word` (default) masks each word; `line` masks each child / "\n"-separated line. */
  by?: "word" | "line";
  /** Build step to play on. Omit to follow the enclosing `Reveal`/`Stagger`. */
  step?: number;
  delay?: number;
  /** Seconds between units. Defaults to `STAGGER.word`, or 0.12 per line. */
  stagger?: number;
  duration?: number;
  className?: string;
}

/**
 * Each word (or line) rises into place from behind its own clipping mask — the
 * keynote headline move. `Title` uses it for every slide heading; reach for it
 * directly for a big statement or a body line that deserves the same entrance.
 * `Accent` children are split too, with the gradient kept continuous.
 *
 * @example <MaskedText step={2} className="text-3xl">A sentence, not a ticket.</MaskedText>
 */
export function MaskedText({
  children,
  by = "word",
  step,
  delay = 0,
  stagger,
  duration = DUR.hero,
  className,
}: MaskedTextProps) {
  const cue = useMotionCue(step, delay);
  const line = by === "line";
  const gap = stagger ?? (line ? 0.12 : STAGGER.word);
  const at = (index: number) => cue.delay + index * gap;

  if (line) {
    return (
      <span className={cn("block", className)}>
        {splitLines(children).map((row, index) => (
          <Mask
            key={index}
            on={cue.on}
            delay={at(index)}
            duration={duration}
            line
          >
            {row}
          </Mask>
        ))}
      </span>
    );
  }

  let index = 0;
  return (
    <span className={className}>
      {splitWords(children).map((unit, key) => {
        if (unit.kind === "space") return " ";
        if (unit.kind === "break") return <br key={key} />;
        const delayAt = at(index++);
        return (
          <Mask
            key={key}
            on={cue.on}
            delay={delayAt}
            duration={duration}
            line={false}
          >
            {unit.kind === "node"
              ? unit.node
              : unit.pieces.map((piece, p) =>
                  piece.slice ? (
                    <AccentText
                      key={p}
                      on={cue.on}
                      slice={piece.slice}
                      delay={
                        delayAt +
                        ACCENT_SHEEN_LEAD +
                        (piece.slice.start / piece.slice.total) * 0.3
                      }
                    >
                      {piece.text}
                    </AccentText>
                  ) : (
                    piece.text
                  ),
                )}
          </Mask>
        );
      })}
    </span>
  );
}
