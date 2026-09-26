# Deck motion kit

The house style for moving things on a slide. The frame (slide transitions, light wash, ambient backdrop) and the core primitives (`Title`, `Kicker`, `Accent`, `Card`, `Reveal`, `Stagger`, `CountUp`) already use it. Use this kit for anything bespoke on a slide, so the whole deck moves with one hand.

```ts
import {
  MaskedText,
  Spotlight,
  DUR,
  EASE,
  STAGGER,
} from "../../_components/motion";
```

## How cues work

Every kit primitive, plus `Title`, `Kicker`, `Accent` and `Card`, is **step-aware**:

- Pass `step={n}` and it plays when the deck reaches build step `n`. `delay` counts from that moment.
- Leave `step` out and it follows the nearest `Reveal` or `Stagger`: same step, and its `delay` is added to theirs. Inside a `Stagger`, each child gets its own cue. An `Accent` in the fifth item sheens when the fifth item lands.
- Outside any reveal, "no step" means "now, on slide entry".

`useMotionCue(step?, delay?)` returns `{ on, delay }` if you build your own primitive. Pair it with `cueTransition(on, delay, enter?)`. It enters with your transition and leaves fast with no delay.

A `Reveal` that wraps only `Title`/`Kicker`/`MaskedText` does not animate itself. It only times them. So `<Reveal delay={0.1}><Title>…</Title></Reveal>` gives a clean masked title, not a title that rises inside a box that also rises.

## Timing scale (`DUR`, seconds)

| Token      | Value | Use for                                           |
| ---------- | ----- | ------------------------------------------------- |
| `DUR.fast` | 0.18  | Exits, dims, colour changes                       |
| `DUR.base` | 0.35  | Chips, labels, icons                              |
| `DUR.slow` | 0.6   | Cards, rows, panels                               |
| `DUR.hero` | 0.9   | Titles, statements, the one hero move on the step |

Exits take about half the enter time and have no delay. `LEAVE` is the stock exit.

## Easing (`EASE`)

| Curve        | Value                      | Use for                                                                         |
| ------------ | -------------------------- | ------------------------------------------------------------------------------- |
| `EASE.expo`  | `[0.16, 1, 0.3, 1]`        | Hero entrances, masks, numbers, camera-like travel. The deck's signature curve. |
| `EASE.out`   | `[0.22, 1, 0.36, 1]`       | Everyday entrances (= `EASE_OUT`)                                               |
| `EASE.inOut` | `[0.65, 0, 0.35, 1]`       | Things that cross and leave: sheens, washes, draws                              |
| `EASE.in`    | `[0.5, 0, 0.75, 0]`        | Exits only                                                                      |
| `SETTLE`     | spring, `bounce: 0`, 0.6 s | Things that land in place and may be interrupted (focus hopping, toggles)       |

Never use a bouncy spring on a business slide. `bounce` above 0.2 reads as a toy.

## Stagger (`STAGGER`, seconds between siblings)

`char` 0.028 · `word` 0.07 · `item` 0.08 · `block` 0.14. A list of more than 8 items should cap the total stagger at about 0.6 s. Past that, the room waits.

## Rules

1. **One hero move per step.** Each click gets one thing that moves big (a title, a number, a morph). Everything else supports it with smaller, shorter moves, or stays still.
2. **Depth with `Camera`/`Layer`**, not with scale tricks. Keep `Layer depth` within ±120 px and camera rotations under about 8°. A `Spotlight` or `Magnify` reads better than a camera push when you only want to point at something.
3. **Transform and opacity only.** `background-position` is allowed for text sheens, and `pathLength` / `stroke-dashoffset` for thin SVG strokes.
4. **Do not:**
   - animate `filter` on anything bigger than a line of text. No blur on panels, charts or full-slide layers. `Reveal`/`StaggerItem` already blur text-only children and nothing else. `Morph` blur is for boxes under about 400 px.
   - animate `box-shadow`, `width`, `height`, `top` or `left` on large elements.
   - put a live `filter: blur()` on anything spinning or continuously moving.
   - run more than a handful of infinite animations per slide. Each `Ticker`, `Connector` flow, `GridBackdrop` and `Pulse` ring counts as one.
   - put keyframe arrays on `type: "spring"`. Motion 12.33 silently drops the whole update batch. Use a tween with `times` instead: `{ duration: 1, times: [0, 0.3, 1] }`.
   - add `useReducedMotion` gates (repo rule), or `initial={false}` on an `AnimatePresence` that wraps slide content. It freezes every mount animation below it.
   - import `motion` from `motion/react`. Use `m` (LazyMotion strict).
5. **Gradient text and movement.** `background-clip: text` only clips the glyphs of the element that owns the background. Anything that moves inside an `Accent` has to paint its own slice. `Title`, `SplitReveal` and `CountUp roll` already do this.
6. **SVG gradients on horizontal lines** need `gradientUnits="userSpaceOnUse"`. A bounding-box gradient collapses on a zero-height path. `DrawPath` and `Connector` handle it.

## The kit

| Primitive            | One line                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MaskedText`         | Words (or `by="line"` lines) rise from behind clipping masks. The `Title` move, for statements and body lines.                   |
| `SplitReveal`        | Per-character rise + fade + slight `rotateX` for one hero word of 20 characters or fewer. `accent` for gradient.                 |
| `DrawPath`           | An SVG path draws itself. `dot` sends a glowing dot along it (CSS `offset-path`, no filter).                                     |
| `Sheen`              | One band of light passes across whatever it wraps.                                                                               |
| `Spotlight`          | A soft glow (`glow`, behind content) or a darkening with a hole (`dim`, above content) that glides to a new target on each step. |
| `GridBackdrop`       | A faint perspective grid (`grid`) or dot field (`dots`) that drifts slowly. For data slides.                                     |
| `Connector`          | A line between two points. It draws in, then carries a flowing brand dash.                                                       |
| `Ticker` / `Marquee` | A slow, endless horizontal scroll of chips.                                                                                      |
| `Pulse`              | Expanding rings from a dot or a wrapped element. For live and attention states.                                                  |
| `Morph`              | Before → after swap keyed by step: the old state recedes, the new one arrives.                                                   |
| `Magnify`            | Lifts one item of a set while its siblings recede and dim.                                                                       |
| `CountRoll`          | Odometer counter (`CountUp roll`).                                                                                               |

## Recipes

**Stat reveal.** The number is the hero; the label follows.

```tsx
<Reveal step={1}>
  <div className="text-7xl leading-none font-semibold">
    <Accent>
      <CountRoll value={4732} step={1} delay={0.15} />
    </Accent>
  </div>
  <div className="mt-4 text-base text-white/50">changes shipped</div>
</Reveal>
```

**Before → after.** One `Morph`, and let the caption change with it.

```tsx
<Morph from={1} states={[<OldFlow key="old" />, <NewFlow key="new" />]} className="mt-10" />
<MaskedText step={2} delay={0.3} className="mt-6 text-2xl text-white/85">
  Same work, a fifth of the wait.
</MaskedText>
```

**Pipeline.** Nodes arrive with a `Stagger`, then connectors draw left to right, one step later.

```tsx
<div className="relative mt-12 h-[160px]">
  <Stagger className="flex justify-between">
    {STAGES.map((stage) => (
      <StaggerItem key={stage}>
        <Card className="w-48">{stage}</Card>
      </StaggerItem>
    ))}
  </Stagger>
  <Connector from={{ x: 192, y: 80 }} to={{ x: 352, y: 80 }} step={1} />
  <Connector
    from={{ x: 544, y: 80 }}
    to={{ x: 704, y: 80 }}
    step={1}
    delay={0.25}
  />
</div>
```

**Spotlight one of many.** Derive the focus from the step; add a light behind it.

```tsx
const step = useDeckStep();
const focus = step >= 1 ? Math.min(step - 1, ITEMS.length - 1) : null;

<div className="relative isolate">
  <Spotlight shots={[null, { x: 160, y: 90 }, { x: 480, y: 90 }]} />
  <Magnify focus={focus} className="grid grid-cols-4 gap-6">
    {ITEMS.map((item) => (
      <Card key={item.id}>{item.label}</Card>
    ))}
  </Magnify>
</div>;
```
