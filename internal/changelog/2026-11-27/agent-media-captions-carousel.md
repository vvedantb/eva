# Agent captures: plain video player, image carousel, captions

- Web chat draws each agent recording with the browser's own `<video controls>`, not the styled `VideoPreview`.
- Agent screenshots show in one row instead of the 2 x 2 gallery: one image at the old width, two or three side by side, more scroll sideways three to a view. A click opens `ImageLightbox`.
- Each capture shows its sandbox file name as a caption (`empty-box-page.png` → "Empty box page", `mediaCaption` in `@eva/shared`).
- The callback sends `mediaNames` (storage id → file name) with `screenshots:attachMedia`; `messages.mediaNames` stores them and `listByParent` returns `media[].name`. Captures stored before this have no caption.
- Phone: the same captions; images scroll sideways, 70% wide so the next one peeks in.
- The session prompt and the `eva-capture` skill tell agents to name captures for what they show.
