import type { z } from "zod";
import type { booleanQuestion, choiceQuestion } from "../_jev/schema";

type ChoiceQuestion = z.input<typeof choiceQuestion>;
type BooleanQuestion = z.input<typeof booleanQuestion>;

/**
 * What a reader sees change, not what the code did. `internal` is the escape
 * hatch for a hunk with no visible effect at all — the chip says so rather
 * than inventing a user-facing story for a type import.
 */
export const CHANGE_KIND_LABELS = {
  icon: "Icon changed",
  colour: "Colour changed",
  wording: "Wording changed",
  layout: "Layout or spacing changed",
  motion: "Animation changed",
  new_element: "Something new on the screen",
  behaviour: "Behaviour changed",
  content: "Displayed information changed",
  internal: "Code-only change, nothing visible",
} as const;

export type ChangeKind = keyof typeof CHANGE_KIND_LABELS;

/** Jev answers with one of the criteria keys; anything else is not a kind. */
export function isChangeKind(value: string): value is ChangeKind {
  return Object.hasOwn(CHANGE_KIND_LABELS, value);
}

/** Asked alongside requested/necessary, so classifying costs no extra call. */
export const CHANGE_KIND_QUESTION = {
  kind: {
    type: "choice",
    instructions:
      "What does a person using the app see change because of this code change? Pick the single most visible effect.",
    criteria: {
      icon: "A different icon, or an icon added or removed.",
      colour: "A different colour, fill, border or shade.",
      wording: "Different text, a label, a heading, a message or button copy.",
      layout: "Different spacing, size, position, alignment or ordering.",
      motion: "Different animation, transition or loading behaviour.",
      new_element:
        "A control, panel, badge, column or whole screen that was not there before.",
      behaviour:
        "The same screen behaves differently: what a click does, what is shown when, validation, navigation.",
      content:
        "The same layout shows different information: which records, which numbers, how a value is calculated or formatted.",
      internal:
        "Nothing a user can see: types, imports, tests, comments, build config, refactors with identical output.",
    },
  },
} satisfies Record<string, ChoiceQuestion>;

/**
 * Asked only for flagged hunks, against the reply the user actually read.
 *
 * This is the question the original miss needed: the trophy was not merely
 * unrequested, it was unreported, so nobody could review it. An unrequested
 * change the agent names is a decision; an unnamed one is a surprise in prod.
 */
export const MENTION_QUESTION = {
  mentioned: {
    type: "boolean",
    instructions:
      "Does the assistant's reply tell the user about this specific change?",
    criteria: {
      true: "The reply names this change, or describes it closely enough that a reader would connect the two.",
      false:
        "The reply never mentions it — it is absent, or covered only by a generic line such as 'updated the UI' that does not name what changed.",
    },
  },
} satisfies Record<string, BooleanQuestion>;

/** The reply is a summary, not a document; Jev needs its words, not its length. */
export const MAX_REPLY_CHARS = 4_000;

export function clipReply(reply: string): string {
  return reply.slice(0, MAX_REPLY_CHARS);
}

const MAX_DETAIL_VALUE_CHARS = 60;

const INDEX_LIKE_NAMES: ReadonlySet<string> = new Set([
  "index",
  "page",
  "route",
  "layout",
  "main",
  "mod",
  "component",
]);

const ICON_PATTERN = /\bIcon[A-Z][A-Za-z0-9]*\b/g;
const COLOUR_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|fill|stroke|ring|from|to|via)-[a-z0-9-]+|--[a-z][a-z0-9-]*|\b[a-z][a-zA-Z]*\.\d\b/g;
const QUOTED_PATTERN = /"([^"\n]{2,60})"|'([^'\n]{2,60})'/g;

function sideLines(body: string, marker: "+" | "-"): string {
  return body
    .split("\n")
    .filter(
      (line) =>
        line.startsWith(marker) && !line.startsWith(`${marker}${marker}`),
    )
    .join("\n");
}

function matchesOf(text: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(
    new RegExp(pattern.source, pattern.flags),
  )) {
    const value = match[1] ?? match[2] ?? match[0];
    if (value.length <= MAX_DETAIL_VALUE_CHARS) found.add(value);
  }
  return [...found];
}

function firstDifference(body: string, pattern: RegExp): string | undefined {
  const removed = matchesOf(sideLines(body, "-"), pattern);
  const added = matchesOf(sideLines(body, "+"), pattern);
  const gone = removed.find((value) => !added.includes(value));
  const fresh = added.find((value) => !removed.includes(value));
  if (gone !== undefined && fresh !== undefined) return `${gone} → ${fresh}`;
  if (fresh !== undefined) return `added ${fresh}`;
  if (gone !== undefined) return `removed ${gone}`;
  return undefined;
}

/**
 * The concrete before/after for the kinds where a short literal says more than
 * any sentence. The other kinds (layout, behaviour, a new element) have no
 * single token that names them, so they stay on the category label alone.
 */
export function changeDetail(
  kind: ChangeKind,
  body: string,
): string | undefined {
  if (kind === "icon") return firstDifference(body, ICON_PATTERN);
  if (kind === "colour") return firstDifference(body, COLOUR_PATTERN);
  if (kind === "wording") return firstDifference(body, QUOTED_PATTERN);
  return undefined;
}

function titleCase(parts: readonly string[]): string {
  const [first, ...rest] = parts;
  if (first === undefined) return "";
  return [
    first.charAt(0).toUpperCase() + first.slice(1).toLowerCase(),
    ...rest.map((word) => word.toLowerCase()),
  ].join(" ");
}

function words(name: string): string[] {
  return name
    .replace(/[.\-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * The screen a path belongs to, in the words someone reviewing the app would
 * use: `…/opportunities/AwardedPanel.tsx` is "Awarded panel", and a file that
 * only names a route borrows its folder — `…/care-package-opportunities/page.tsx`
 * is "Care package opportunities".
 *
 * A dynamic segment (`[id]`) names no screen and is skipped; a route group
 * (`(dashboard)`) does, once the parentheses come off.
 */
export function humaniseSurface(path: string): string {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const file = segments.at(-1) ?? path;
  const base = file.replace(/\.[^.]+$/, "");
  const routeLike =
    INDEX_LIKE_NAMES.has(base.toLowerCase()) || base.startsWith("[");

  if (routeLike) {
    const folder = segments
      .slice(0, -1)
      .toReversed()
      .find(
        (segment) =>
          !segment.startsWith("[") && segment !== "src" && segment !== "app",
      );
    return folder === undefined
      ? file
      : titleCase(words(folder.replace(/^\(|\)$/g, "")));
  }
  const named = titleCase(words(base));
  return named.length > 0 ? named : file;
}

/**
 * The chip's headline for one flagged hunk: what changed, with the literal when
 * there is one. Falls back to the file name when Jev could not classify it, so
 * a row is never blank.
 */
export function describeChange(args: {
  kind: ChangeKind | undefined;
  file: string;
  body: string;
}): string {
  if (args.kind === undefined) return `Changed ${humaniseSurface(args.file)}`;
  const label = CHANGE_KIND_LABELS[args.kind];
  const detail = changeDetail(args.kind, args.body);
  return detail === undefined ? label : `${label} (${detail})`;
}
