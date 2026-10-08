---
name: eva-feature-demo
description: >-
  Record a real agent-browser screencast of one eva feature being used end to end, convert it to
  an X-ready mp4, and write a tweet for it. Use when the user wants a screen recording / screengrab
  video / GIF-style demo of a new feature — "record me using X", "make a video of this feature",
  "screencast the new flow". This is RAW footage of a real flow, no music and no editing. NOT for
  polished multi-scene launch videos with captions and a score — that is eva-launch-video.
---

# eva feature screencast

One unbroken recording of one feature actually working, plus a tweet. The value is that it is real:
real app, real data, real latency. No cuts, no music, no marketing captions.

Output — post the **zoom** cut. All at the repo root, already gitignored:

| File                             | What it is                                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| `recordings/<slug>.webm`         | raw take from agent-browser                                        |
| `recordings/<slug>.actions.json` | action log (when/where each click and typing burst happened)       |
| `recordings/<slug>-zoom.mp4`     | **the artefact** — camera, cursor, click rings, keystroke captions |
| `recordings/<slug>.mp4`          | plain straight conversion; fallback if the zoom looks wrong        |

**The render pass is the point of this skill.** A raw agent-browser capture has no mouse cursor and
no visible typing — Playwright draws no pointer, and `fill` puts a whole sentence on screen in one
frame. Watched flat, the demo is a series of unexplained jumps. The render pass adds back exactly the
four things the capture cannot record, and nothing else:

| Added                 | Because                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| **Camera zoom**       | pushes in on the target just before the action, back out to full frame after |
| **Synthetic cursor**  | a real pointer, gliding target to target, dipping on each click              |
| **Click ring**        | a click has no visual effect of its own                                      |
| **Keystroke caption** | types the text out at ~20 chars/sec, so keystrokes are readable              |

All four come from the same action log, so the take script is the only place you describe the flow.

The zoom is the **opposite** rule from `eva-launch-video`, which is locked at zero zoom. There the
shots are static screenshots and any zoom hides UI. Here the zoom is motivated by an action and
always returns to the full frame, so nothing is permanently hidden.

## Non-negotiable defaults

1. **Script the whole flow to a bash file first, then record it.** Never drive a recording
   interactively — a stale ref or a mistyped step lands in the take and you start over. Write the
   sequence, dry-run it with recording off, then run once. Start from `templates/screencast.sh`.

2. **1280×720 viewport.** agent-browser records at viewport size, so this is also the video size —
   exactly 16:9, no crop on X.

3. **Set viewport, theme, and overlay-hiding BEFORE `record start`.** Anything after the recorder is
   running is in the video, including the overlay-hiding flash. Collapse the sidebar here too — it
   eats ~250px of the frame and is never the feature:

   ```bash
   agent-browser eval "document.querySelector('button[aria-label=\"Hide sidebar\"]')?.click()"
   ```

   The collapsed state persists across navigation, so one click before `record start` covers the
   whole take.

4. **15–40 seconds.** Long enough to show one thing land, short enough to loop. One feature per
   recording. If the flow needs 60s, it is two recordings or the wrong flow.

5. **Pace for a human, not a test runner.** `wait 800`–`1200` after every visible action, `wait 1500`
   on the final state so the loop doesn't snap back before the payoff registers. Un-paced automation
   looks like a glitch, not a demo.

6. **Drive every action through `tap` / `say` / `go`.** These template helpers are the only source of
   the action log. A hand-written `agent-browser click` or `fill` produces no cursor movement, no
   zoom, no click ring, and no caption — the render pass is blind to it. If a step needs raw
   agent-browser, call `mark` yourself right before it. Also:
   - Prefer flows whose result is unmistakable (a panel opens, a list fills, a diff appears).
   - Pause _before_ the action too, so the viewer has read the screen when it changes.
   - `scrollintoview` before clicking below the fold — an off-screen click reads as a random jump.
     `tap` does this for you.

7. **Let `say` finish.** It waits out the caption (`len × 50ms + 1400`) because the caption is drawn
   over the footage that follows — end the recording early and the caption gets cut off mid-sentence.
   Don't shorten those waits to hit a duration target; drop a step instead.

8. **Never submit. Type only.** Fill inputs, open pickers, stage the state — then stop. No Enter in a
   composer, no send arrow, Create, Save, Run, or Start, and never kick off a real session or agent
   run, not even for a demo. Submitting mutates the user's real workspace and burns real compute; the
   staged state is the whole deliverable. Enter is allowed only where it commits to the field itself
   and nothing else (accepting an `@`-mention from an open picker) — otherwise click the picker row.

9. **Real footage, finished states.** Don't wait on live agent runs inside a recording (sandboxes are
   stopped, runs are slow and flaky). Record already-completed work, or a flow that resolves locally.
   If a step needs a running sandbox and there isn't one, redesign the flow.

10. **Confidentiality.** Own repo `vvedantb/eva` only. Never client repos (`evalucom/carepulse`,
    `eprocurement`) or the "Codebases" home listing them. This matters more than for a still — the
    recording passes through sidebars, lists, and modals you didn't plan to feature. Watch what
    scrolls past. **Never raise personal-data concerns about names or emails on screen** — Settings →
    Experimental has a blur-PID toggle that blurs every `[data-pii]` element, so this is handled in
    the product. Turn it on if a recording will pass through a lot of member lists.

## Workflow

1. **Pin down the feature and the flow.** Name the 3–5 concrete steps: start state → actions →
   payoff state. Write them out before touching the browser. `git log --oneline -15` or
   `internal/changelog/` (newest month file) if the user hasn't said which feature.

2. **Set up the browser** (`.claude/skills/eva-launch-video/references/capture-workflow.md` §1–2):

   ```bash
   pnpm dev                                          # from repo root → localhost:5173
   agent-browser close
   agent-browser open "http://localhost:5173/?agent=true"   # ?agent=true — boolean, not /?agent
   agent-browser set viewport 1280 720
   agent-browser set media dark
   agent-browser open "http://localhost:5173/?agent=true"
   agent-browser wait --load networkidle && agent-browser wait 5000
   ```

3. **Write the take script.** Copy `templates/screencast.sh` to the scratchpad, fill in the flow.
   Resolve refs while writing it (`agent-browser snapshot -i` at each stage) — but re-snapshot inside
   the script too, because refs don't survive navigation.

4. **Dry run with recording off.** `RECORD=0`. Fix every failed step. Watch for steps that succeed
   but look wrong (a click landing while a skeleton is up).

5. **Record the take.** `RECORD=1`. The script stops the recorder in a `trap` so a mid-flow failure
   still saves the partial file. Re-take with a fresh run — `record restart` also works.

6. **Render the zoom pass.** Reads the action log, so it needs no arguments beyond the slug:

   ```bash
   cd video && node scripts/render-screencast.mjs <slug>          # → recordings/<slug>-zoom.mp4
   ```

   It validates the log, stages the webm under `video/public/recordings/`, reads the real duration off
   the file, and renders the `FeatureScreencast` composition. Output is h264 / `yuv420p` / faststart /
   silent — exactly what X wants. `--zoom=1.4` for a gentler push (default `1.55`; above ~1.7 the
   surrounding UI stops being readable).

   Plain conversion with no camera move, if the zoom fights the flow:

   ```bash
   bash .claude/skills/eva-feature-demo/scripts/to-mp4.sh <slug>
   ```

7. **QA by reading frames.** You can't watch video. Read the action log first, then pull a still at
   each action time (a zoom peak) plus one between two actions (should be full-frame, no zoom):

   ```bash
   cat recordings/<slug>.actions.json
   bash .claude/skills/eva-feature-demo/scripts/frames.sh <slug>-zoom 3 6.4 11.5 15.9
   ```

   Check: cursor sitting on the element being acted on (not adrift); click ring on the button, not
   near it; keystroke caption mid-type, legible, not covering the thing it describes; zoom landing
   centred and staying inside the frame; the between-action frame fully zoomed out; overlays gone; no
   skeletons/spinners caught mid-flow; payoff state legible and holding; nothing confidential scrolled
   past; all four edges intact. Reshoot on any failure — it's a 2-minute loop.

8. **Write the tweet.** Invoke the `eva-tweet` skill. The video carries the proof; the tweet states
   what now exists — hook, optional positioning fragment, `→` list, optional close. Don't narrate the
   video ("watch as I…") and don't reference it at all.

9. **Hand over.** The `-zoom.mp4` path as a markdown link, duration, the tweet in a fenced block, and
   anything in frame worth a second look before posting.

## Quick reference

| Need                      | Command                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| Take template             | `.claude/skills/eva-feature-demo/templates/screencast.sh`                  |
| Dry run / record          | `RECORD=0 bash take.sh` · `RECORD=1 bash take.sh`                          |
| **Zoom pass (post this)** | `cd video && node scripts/render-screencast.mjs <slug> [--zoom=1.55]`      |
| webm → plain mp4          | `bash .claude/skills/eva-feature-demo/scripts/to-mp4.sh <slug>`            |
| Stills at seconds         | `bash .claude/skills/eva-feature-demo/scripts/frames.sh <slug>-zoom 1 5 9` |
| Verify the mp4            | `node video/scripts/check-audio.mjs <abs-path-to-mp4>`                     |
| Inspect any media file    | `cd video && npx remotion ffmpeg -i <file>`                                |

## Tuning the render pass

The defaults are right for a normal take. To change the motion — zoom amount, cursor timing, caption
speed, how segments merge — read `references/render-pass.md`, which covers the action log format,
`video/src/screencast/zoom.ts`, and the composition.

## Gotchas

- **Sign-in URL is `/?agent=true`** — `/?agent` throws a zod `SearchParamError`. If it hangs on
  "Signing in…" and the console says `You're already signed in`, navigate straight to the target.
- **Remotion's bundled ffmpeg is built `--disable-filters`.** Most `-vf` filters (including `fps`)
  error with "No option name near…". Extract stills by seeking instead: `-ss <sec> -frames:v 1`.
  `frames.sh` already does it this way.
- **The dev overlays are three nodes, all hanging off `<html>`, not `<body>`.** Hiding
  `#react-scan-root` alone is not enough: the component outlines and labels are drawn on a bare
  `html > canvas` with no id or class, and that is the one that wrecks a take. Kill all three
  (`#react-scan-root`, `html > canvas`, `[data-agentation-root]`) with inline
  `display:none !important` — a stylesheet loses to their inline styles. The template's `hide_overlays`
  does it, and `go` re-runs it because a page load remounts them.
- **Never pass `--props` as inline JSON on Windows.** The shell strips the quotes and Remotion fails
  with "neither valid JSON nor a file path". `render-screencast.mjs` writes a props file.
- **Refs (`@e1`) invalidate on any DOM change.** Re-snapshot inside the script after each navigation,
  never reuse a ref across a page change.
- **Don't post the webm.** X's support for it is unreliable; always ship the mp4.
- **The pointer in the video is drawn, not recorded.** It only knows the positions in the action log,
  so it cannot show a hover, a drag, or a scroll. If a flow's meaning depends on one of those, it is
  the wrong flow for this skill.
- **`say` records the literal text**, so it ends up burned into the video as a caption. Never type
  anything into a demo you wouldn't post.
- **Recording adds overhead**, so the app is slightly slower on camera than in real use. Don't
  compensate by cutting the waits — that reintroduces the unwatchable-automation problem.
