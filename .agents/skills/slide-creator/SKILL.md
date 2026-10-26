---
name: slide-creator
description: >-
  Build or edit slides in the Eva deck engine (`/slides/*`: Friday, Annual
  review, Intro, Bee). Encodes the presenter's rules: short copy, no footers,
  no full stops on titles, real logos and real UI, every slide animated, builds
  that play on their own, verified with screenshots. Use when the user says
  /slide-creator, asks for a new slide or deck, or asks to change slide
  content, layout or motion.
---

# Slide creator

The decks live in `apps/web/src/routes/_components/deck/`. Read the deck
order file (`slides/<deck>.ts`), one or two neighbouring slides, and
`speakerNotes.ts` before you write a new slide. Copy their patterns.

## 1. Copy

- One idea per slide. The title says it. The visual proves it.
- **No full stop at the end of a title.** A stop inside a title is fine
  ("One switch. Less machinery"). This also covers cover slides and text
  inside `<Accent>`.
- **No footers, footnotes or source lines on the slide.** Put sources, dates
  and caveats in the speaker note (`Detail:` or `Figures:`).
- No subtext paragraphs under the title. If a line needs more than about 12
  words, it belongs in the speaker note.
- State ideas plainly. Do not dress a statement up as a quote.
- Write for the room. Most audiences are not technical: show the benefit, not
  internal counts (commits, lines of code, bundles).
- One slide per idea across the deck. Before you add a slide, check that no
  other slide already shows the same mechanism. Merge or move instead.
- UK English. Follow the organisation's style rules.

## 2. Examples

- Use a real, specific scenario from the audience's own work, not a generic
  one ("Acme", "Widget Co"). For Evalucom: AQP provider onboarding, CHC
  placements, nursing home or domiciliary care work.
- Invented examples must name no real provider, ICB, person or patient, and
  must carry no invented figures. Say in the speaker note that the example is
  invented.
- If something did not happen, say so on the slide: "would have answered", not
  "answered".
- Real facts on a slide need a source in the speaker note: name and date, or
  the URL that was checked.

## 3. Real assets, real UI

- **Named products get their real logo, never a generic icon.**
  1. Look in the product's own repo first (for example `VmemLogo.tsx`, Bee's
     `BeeLogo.tsx`) and port the SVG as a small component.
  2. Otherwise take it from svgl:
     `https://raw.githubusercontent.com/pheralb/svgl/main/static/library/<name>.svg`
     and save it in `apps/web/public/brands/`.
  3. Eva's mark is `EvaDiscMark`. The Grok mark is `GrokMark`.
- Generic icons (Tabler) are only for ideas, never for products.
- **Show UI as the product really draws it.** Port the real component, or
  copy its markup and styles. Examples: Bee's link chips are small pills with
  a favicon (or a file icon for a note), the label and an open-link arrow, not cards. Bee's logo plays its
  real animated states (idle, listening, thinking, searching, tool, done,
  error).
- Site icons use real favicons
  (`https://www.google.com/s2/favicons?domain=<domain>&sz=64`), never a
  letter or a globe.
- Do not commit PNG or other image files without the user's yes. Prefer SVG or
  a runtime URL.

## 4. Motion

- **Every slide animates.** Give it build steps (`steps` in the deck file,
  `useDeckStep()` in the slide), and reveal content with `cueTransition` and
  the springs in `_components/motion/tokens.ts`.
- **Builds play on their own.** The deck auto-plays each step (1.1 s first,
  then 1.5 s apart). When a step needs reading or talking time, set `autoMs`
  on the slide, one value per step. Do not add manual slides.
- Next and back move whole slides. Back lands on the finished slide.
- Use a `Camera` shot per step. Zoom in on small UI (a notch, a chip, a
  button) when it is the point of the step, then pull back.
- Use `layoutId` morphs (`SHARED` ids, `morph: true` on the second slide) for
  four or five key pairs per deck, not more.
- Keep effects light:
  - glow sits behind cards, never on top;
  - use a softer glow on light slides;
  - no light sweep across the whole slide;
  - `Sheen` only on a hero element.
- Do not add `prefers-reduced-motion` checks. This app does not use them.
- Never put a live `filter: blur()` on a spinning element.

## 5. Theme

- Light slides set `theme: "light"`. Inside them, `text-white` and
  `bg-white/*` flip to ink, so use `text-[#fff]` for true white on a brand
  fill.
- Brand decks (Bee) use their own palette (`BEE`, `BEE_CARD`) and fonts, set
  with `brand` on the route.

## 6. Code rules

- React Compiler is on:
  - no `useMemo` or `useCallback`;
  - no `useEffect` unless it is a real external timer.
- No `as`, `any`, `unknown` or non-null `!`.
- Use `m` from `motion/react`, not `motion`.
- Keep shared slide parts in the deck's `_parts/` folder.

## 7. Speaker notes

Each slide has a note in `speakerNotes.ts`, keyed by slide id:

- an opening line with the one idea;
- one `→ Step n:` line per build step;
- `Detail:` for sources, caveats and the "example is invented" line;
- `Next:` for the hand-off line to the following slide.

When slides move, are added or are removed:

1. Rewrite the `Next:` lines on both sides of each gap.
2. Fix any "slide 23" style number references.

## 8. Verify and finish

1. Run prettier, then `npx tsc -p tsconfig.json --noEmit` from `apps/web`.
2. Check with agent-browser on the running dev server. Open
   `/slides/<deck>?slide=<n>` and wait for the auto-build. Save screenshots to
   `/tmp/checks/` and look at them before you say a slide is done.
3. Add a line to the monthly changelog in `internal/changelog/`.
4. In the reply, name every visible change. Mark your own choices
   "(not asked for)".
