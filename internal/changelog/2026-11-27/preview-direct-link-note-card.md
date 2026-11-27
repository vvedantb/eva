# Direct sandbox link: a note card after Select element

- On a direct link, Select element now opens a card next to the element: the element chips (`<tag.class>`, React name, text), the accessibility line, a "What should Eva change?" field, Cancel and "Copy for Eva". It mirrors `AnnotationCommentCard`, which only exists inside Eva.
- Copy puts the note and the element context on the clipboard. Enter copies, Shift+Enter adds a line, Esc cancels. Clicking another element moves the card. Typing in the card does not reach the page's own shortcuts.
- New `preview-annotation-src/commentCard.ts`. The palette moves to `theme.ts`, shared by the toolbar and the card. The theme message gains `border`, `primary`, `primaryText` and `field`. `SCRIPT_VERSION` is `stream-v42`.
- Inside Eva nothing changes: the comment card and drawer stay in the Eva page.
