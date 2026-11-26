# Preview comments clean-up

- Removed `dataMigrations:backfillPreviewAnnotations`: it has run on prod, so every older preview annotation already carries `annotation`.
- Element chips drop Next.js CSS-module hashes that end in `_` (`<div.Overview-module__Ozj5PW_>` → `<div.Overview-module>`). Applies to new comments; stored chips keep their text.
- The preview comments plan moved to `internal/plans/implemented/`.
