# Slides: the presenter preview plays each build

- The presenter window's preview now runs the slide's build on its own clock, so it no longer sits on the first step while the stage window is hidden or covered.
- Steps from the stage only move the preview forward; local steps are not broadcast, so the two windows never fight.
- Build timings live in one place, `autoStepDelay` in `deckNavigation.ts`, shared by the stage and the presenter.
