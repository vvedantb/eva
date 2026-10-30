/**
 * The geometry behind `SessionsTimeline`. Kept apart from the component so the
 * lane arithmetic can be read — and adjusted — without scrolling past motion
 * props, and so the drawing code stays a plain function of `place()`.
 */

/** Design width of the timeline, matching the slide's content column. */
export const TRACK_W = 1088;
/** Vertical centre of the track inside the timeline box. */
export const LINE_Y = 228;
export const BOX_H = 412;
/** Left and right breathing room so the first and last label cards fit. */
export const INSET = 90;
/** 1 July to 10 September 2026, the span the axis maps. */
const SPAN_DAYS = 71;
/**
 * Wide enough that the longest label — "Sessions in the sidebar everywhere" —
 * settles on two lines rather than three. `INSET` is half a card plus two, so
 * the first and last cards still sit inside the track.
 */
export const CARD_W = 176;
/** Clear space demanded between two cards that share a lane. */
const CARD_GUTTER = 16;
const MIN_GAP = CARD_W + CARD_GUTTER;
/**
 * Three lanes per side. The July cluster puts six milestones inside 180px of
 * track, and at this card width all six conflict with each other, so they need
 * six distinct lanes: three above the line and three below.
 */
const LANES = 3;
/** Stem to the shallowest lane, then the clear space between stacked lanes. */
const STEM_BASE = 24;
const LANE_GAP = 10;
/** A label line at `leading-snug`, then the `mt-1` and the date line under it. */
const LABEL_LINE_H = 20;
const DATE_BLOCK_H = 20;
/** Approximate advance width of the label face, used to predict wrapping. */
const CHAR_W = 7.1;

interface Milestone {
  /** Days after 1 July 2026. */
  day: number;
  label: string;
  date: string;
  /** Build step that reveals this milestone. */
  step: number;
}

// One row per milestone reads as the table it is.
// prettier-ignore
const MILESTONES: readonly Milestone[] = [
  { day: 8, label: "Follow-up queue", date: "9 Jul", step: 1 },
  { day: 17, label: "Built-in browser tab", date: "18 Jul", step: 1 },
  { day: 20, label: "Files explorer", date: "21 Jul", step: 1 },
  { day: 21, label: "Sessions in the sidebar everywhere", date: "22 Jul", step: 1 },
  { day: 24, label: "Plan mode", date: "25 Jul", step: 1 },
  { day: 28, label: "Browser-style tabs", date: "29 Jul", step: 1 },
  { day: 31, label: "Inbox badge and chime", date: "1 Aug", step: 2 },
  { day: 47, label: "Works on mobile", date: "17 Aug", step: 2 },
  { day: 52, label: "Usage limits shown up front", date: "22 Aug", step: 2 },
  { day: 58, label: "Auto-archive notices", date: "28 Aug", step: 2 },
  { day: 65, label: "Switch account when a limit hits", date: "4 Sep", step: 3 },
  { day: 71, label: "Fewer stuck turns", date: "10 Sep", step: 3 },
];

export const MONTHS: readonly { name: string; centre: number }[] = [
  { name: "July", centre: 0.225 },
  { name: "August", centre: 0.635 },
  { name: "September", centre: 0.91 },
];

export interface Placed extends Milestone {
  x: number;
  above: boolean;
  lane: number;
  /** Length of the stem from the axis to this card. */
  stem: number;
  /** Index within its build step, used for the stagger. */
  order: number;
}

/** Height a card takes, from the number of lines its label will wrap onto. */
function cardHeight(label: string): number {
  const lines = Math.max(1, Math.ceil((label.length * CHAR_W) / CARD_W));
  return lines * LABEL_LINE_H + DATE_BLOCK_H;
}

/**
 * Lays the milestones out along the axis: x from the date, sides alternating,
 * and a deeper lane whenever every shallower lane on that side already holds a
 * card within a card-width of this one.
 *
 * Stems are measured rather than fixed, so a lane only drops as far as the
 * tallest card above it actually reaches. Three uniform lanes per side would
 * need 472px of box and the slide has 412px. Pure, so it can run during render.
 */
export function place(): Placed[] {
  const lastOnLane = new Map<string, number>();
  const seenInStep = new Map<number, number>();
  const tallest = new Map<string, number>();
  const laid: Placed[] = [];

  MILESTONES.forEach((milestone, index) => {
    const x = INSET + (milestone.day / SPAN_DAYS) * (TRACK_W - INSET * 2);
    const above = index % 2 === 0;
    const side = above ? "up" : "down";
    let lane = 0;
    while (lane < LANES - 1) {
      const last = lastOnLane.get(`${side}-${lane}`);
      if (last === undefined || x - last >= MIN_GAP) break;
      lane += 1;
    }
    const key = `${side}-${lane}`;
    lastOnLane.set(key, x);
    tallest.set(
      key,
      Math.max(tallest.get(key) ?? 0, cardHeight(milestone.label)),
    );
    const order = seenInStep.get(milestone.step) ?? 0;
    seenInStep.set(milestone.step, order + 1);
    laid.push({
      day: milestone.day,
      label: milestone.label,
      date: milestone.date,
      step: milestone.step,
      x,
      above,
      lane,
      order,
      // Grown below, once every lane's tallest card is known.
      stem: STEM_BASE,
    });
  });

  for (const item of laid) {
    const side = item.above ? "up" : "down";
    for (let lane = 0; lane < item.lane; lane += 1) {
      item.stem += (tallest.get(`${side}-${lane}`) ?? 0) + LANE_GAP;
    }
  }

  return laid;
}
