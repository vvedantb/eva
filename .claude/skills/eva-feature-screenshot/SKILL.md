---
name: eva-feature-screenshot
description: >-
  Grab a single clean HD screenshot of a new eva feature from the real running app (Playwright at
  deviceScaleFactor 2, 1280 layout captured crisp at 2560×1440, dev overlays hidden) and write a
  tweet to post with it. Use whenever the user wants to show off / announce / post about a feature
  with a screenshot, screengrab, or image — "grab a shot of X and write a tweet", "post this new
  feature", "screenshot for X/Twitter". This is the NO-VIDEO path: one still image + copy. For
  motion use eva-feature-demo (real screen recording) or eva-launch-video (edited Remotion cut).
---

# eva feature shot

One screenshot of a shipped feature + one tweet. No Remotion, no music, no editing, no captions
burned into the image — the product UI is the asset.

Two files land in `screenshots/` at the repo root (already gitignored):

| File                             | What it is                                                  |
| -------------------------------- | ----------------------------------------------------------- |
| `<YYYY-MM-DD>-<slug>.png`        | raw 2560×1440 shot — keep it, it is the reshoot-free source |
| `<YYYY-MM-DD>-<slug>-framed.png` | **post this one** — 3200×1800, branded frame                |

The framed version sits the raw shot on eva's brand gradient with rounded corners, an eva icon and
the "Eva" wordmark above it. That is why the shot reads as a product announcement rather than a bug
report screenshot.

## Non-negotiable defaults

1. **1280 layout, captured HD at 2560×1440 (16:9).** The scripts drive a real Chrome at
   deviceScaleFactor 2 and capture `scale:"device"`, so the app lays out at its native 1280 width
   (readable element sizes) but the PNG is twice the pixel density — crisp on a retina timeline.
   16:9 is what X shows in-timeline without cropping. The framed output is 3200×1800 — also 16:9,
   so the frame costs nothing in the timeline. **agent-browser cannot do this**: its `screenshot`
   captures at CSS pixels and discards DPR, so it always outputs 1280×720. Use the HD scripts.

2. **Never full-page.** A full-page shot of a dense app becomes a tall strip that renders
   thumbnail-sized in the timeline. One viewport, one idea.

3. **Hide the dev overlays before shooting.** react-scan and agentation both render into the page.
   `scripts/hd-shot.mjs` handles it — use the scripts rather than a hand-rolled chain.

4. **Match the app's real theme.** Whatever the user is running (`set media dark` for dark). Don't
   restyle the app for the photo.

5. **The feature must be the visual subject.** A 200px panel in the corner of a busy page fails.
   Navigate to a view where it dominates, or open the surface that contains it (modal, sheet, detail
   pane) so it reads at timeline size.

   **The sidebar is collapsed automatically.** `shot.sh` (and a plain `hd-shot.mjs --path` shot)
   collapses the nav rail before capturing — it eats ~250px of a 1280px frame and nothing in it is
   ever the feature. Pass `--no-collapse` only when the sidebar itself IS the feature. In a
   `--recipe`, call `ctx.collapseSidebar(page)` yourself (recipes own their own staging).

   Same rule for any secondary list rail (Reviews list, Settings nav) if the surface offers a way
   to hide it. Verify in the raw PNG: if a column of unrelated nav items survives, reshoot.

6. **Frame it, but don't annotate it.** Always run step 6 — the gradient + wordmark is the house
   style. Never add arrows, red circles, callout text, or fake browser chrome unless asked.

7. **Never submit. Type only.** Fill inputs, open pickers, stage the state — then shoot. No Enter in
   a composer, no send arrow, Create, Save, Run, or Start, and never kick off a real session or agent
   run, not even for a better shot. Submitting mutates the user's real workspace and burns real
   compute; the staged state is what you are photographing. Enter is allowed only where it commits to
   the field itself and nothing else (accepting an `@`-mention from an open picker) — if you can't be
   certain that's all it does, click the picker row instead.

8. **If the data is ugly, fix the data — don't reshoot around it.** Default 7 stops you _driving_
   the app to produce state; it does not stop you _writing_ the state. Real dev data is the usual
   reason a shot fails: error walls ("Failed to stop sandbox" ×8), `Untitled session` rows, a
   half-migrated turn, one repo where the feature needs three. Editing the app's own dev data around
   the shot beats hunting for a session that happens to look good, and beats restyling the app
   (default 4 still holds — change the data, never the CSS).

   Write directly to the dev deployment: a throwaway `internal/screenshotStaging.ts` mutation run
   with `npx convex run`, or the Convex dashboard. Give sessions real readable titles, delete the
   error/system messages in frame, seed the second and third row the feature needs.

   Rules for this:
   - **Dev deployment only.** Confirm the target before writing (`npx convex env get CONVEX_URL`, or
     read `.env.local`) and never point a staging mutation at prod.
   - **Additive and reversible first.** Prefer patching a title or inserting a demo row over
     deleting real history. If you must delete, look at the rows first and say what you removed.
   - **Plausible, not fabricated-specific.** Titles and prompts that read like real work. Never
     invent metrics, customer names, or numbers the tweet then repeats as fact.
   - **Delete the staging mutation when the shot is done** — same cleanup rule as any migration.
   - Tell the user what you changed, in the handover.

9. **Confidentiality.** Use the user's own repo `vvedantb/eva`. Never client repos
   (`evalucom/carepulse`, `eprocurement`) and never the "Codebases" home that lists them. Check
   doc/task/session lists in frame for client-named items — stage a clean demo row if the list is
   dirty. **Never raise personal-data concerns about names or emails on screen** — Settings →
   Experimental has a blur-PID toggle that blurs every `[data-pii]` element, so this is handled in
   the product. Do flag error panels leaking env var names or project ids.

## Workflow

1. **Pin down what shipped.** If the user hasn't said which feature, ask — one question, not a
   survey. `git log --oneline -15`, `git diff --stat`, or `internal/changelog/` (newest month file)
   usually name it.
   You need the feature and the URL that shows it.

2. **Start the app.** Just the dev server — the HD scripts launch their own Chrome and sign in as
   the agent user (`/?agent=true`) themselves, in a fresh context at deviceScaleFactor 2. You do
   not drive agent-browser to shoot.

   ```bash
   pnpm dev   # from repo root → localhost:5173
   ```

3. **Shoot it.** For a plain URL shot, `shot.sh` navigates, collapses the sidebar, hides overlays,
   and captures at 2560×1440:

   ```bash
   bash .claude/skills/eva-feature-screenshot/scripts/shot.sh /vvedantb/eva/web/sessions sessions
   ```

   Takes a URL path + slug (+ optional settle ms, + optional `--no-collapse`).

   For a **staged** shot (open a menu, type a prompt, then capture), write a recipe — a `.mjs`
   exporting `export async function stage(page, ctx)` — and pass it to `hd-shot.mjs`. The recipe
   owns navigation, sidebar collapse, and staging; `ctx` gives you `{ BASE, hideOverlays,
collapseSidebar, settle }`. Use `page.getByRole(...)` (Playwright) locators. To find the exact
   accessible names, drive agent-browser interactively first and `snapshot -i` / `read_page`.

   ```js
   // recipe.mjs — stage the mode picker open with a prompt typed in
   export async function stage(page, ctx) {
     await page.goto(`${ctx.BASE}/vvedantb/eva/web/sessions`, {
       waitUntil: "networkidle",
     });
     await ctx.settle(3000);
     await ctx.collapseSidebar(page);
     await page.getByRole("textbox", { name: /Ask Eva/ }).click();
     await page.keyboard.type("Redesign the sessions sidebar…");
     await page.getByRole("button", { name: "Edit", exact: true }).click();
     await ctx.settle(600);
   }
   ```

   ```bash
   node .claude/skills/eva-feature-screenshot/scripts/hd-shot.mjs --slug session-modes --recipe /abs/path/recipe.mjs
   ```

   Stage clean, readable inputs — a tidy demo title beats a real messy one. Never submit (default 7).

4. **Read the PNG back and judge it.** This is where bad shots get caught:
   - Is the feature the obvious subject, or lost in chrome?
   - Any overlay/toolbar survived? Any skeleton, spinner, or `—` placeholder still on screen? (Bump
     the settle ms and reshoot.)
   - All four edges: clipped labels, half-rendered buttons, a cut-off column?
   - Anything confidential per default 9?
   - Empty states: an empty board proving "kanban tasks" is a bad shot. Populate or pick another view.

   When the frame fails because of the _data_ — error walls, `Untitled session`, one row where the
   feature needs three — stage the dev data (default 8) rather than hunting for a luckier screen.

5. **Frame it.**

   ```bash
   bash .claude/skills/eva-feature-screenshot/scripts/frame.sh <slug> "Eva"
   ```

   Writes `screenshots/<today>-<slug>-framed.png` (3200×1800). It renders `templates/frame.html`
   through its own Chrome at deviceScaleFactor 2 — a separate browser from the shot, so nothing to
   restore afterwards. Read the framed PNG back too — check the gradient hasn't washed out the UI at
   the corners and the wordmark isn't clipped. A third argument frames a raw PNG from another path.
   `templates/frame.html` is the only place this skill's brand colours live.

6. **Write the tweet.** Invoke the `eva-tweet` skill — hook, optional positioning fragment, `→`
   capability list, optional close. The screenshot carries the proof, so the tweet states what now
   exists rather than describing the picture. Never reference the image at all.

7. **Hand over.** The **framed** file path as a markdown link, the tweet in a fenced block, and
   anything in frame the user should check before posting.

## Quick reference

| Need                      | Command                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Shoot a URL (HD)          | `bash .claude/skills/eva-feature-screenshot/scripts/shot.sh <path> <slug> [settle-ms]`               |
| Keep the sidebar in frame | `bash .claude/skills/eva-feature-screenshot/scripts/shot.sh <path> <slug> <settle-ms> --no-collapse` |
| Staged shot (menu/typing) | `node .claude/skills/eva-feature-screenshot/scripts/hd-shot.mjs --slug <slug> --recipe <abs.mjs>`    |
| **Frame it (post this)**  | `bash .claude/skills/eva-feature-screenshot/scripts/frame.sh <slug> [title] [raw-png]`               |
| Find accessible names     | drive agent-browser interactively, then `agent-browser snapshot -i`                                  |
| Debug a blank/broken page | `agent-browser console` · `agent-browser errors`                                                     |

## Gotchas

- **HD lives in Playwright, not agent-browser.** agent-browser's `screenshot` captures at CSS
  pixels and discards devicePixelRatio, so it caps at 1280×720. `hd-shot.mjs` / `hd-frame.mjs` use
  the playwright-core bundled inside the global agent-browser install; set `PW_CORE` if it lives
  elsewhere. Both launch `channel:"chrome"`, so system Chrome must be installed.
- **The scripts sign themselves in** at `/?agent=true` (a boolean; `/?agent` throws a zod
  `SearchParamError`) in a fresh browser context. No agent-browser session needed to shoot.
- **The dev overlays are three nodes, all hanging off `<html>`, not `<body>`.** Hiding
  `#react-scan-root` alone is not enough: react-scan draws its component outlines and labels on a
  bare `html > canvas` with no id or class, and that is the one that ruins the shot. `hd-shot.mjs`
  kills all three (`#react-scan-root`, `html > canvas`, `[data-agentation-root]`) with inline
  `display:none !important`, because a stylesheet loses to their inline styles.
- **A staged shot is a fresh browser, not the one you explored in.** Use agent-browser to _find_
  selectors, but the recipe re-navigates and re-stages from scratch in Playwright's own context —
  put every step in the recipe. Prefer `page.getByRole(...)` over CSS; refs like `@e1` don't exist
  here.
- **Two or more images dilute the point.** X renders one image full width; a second halves both.
  Only shoot more than one for a genuine before/after.
- **Don't reuse `video/public/captures/`** — those are Remotion assets framed for a different job.
