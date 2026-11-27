# Preview toolbar moves into the page

- New `preview-annotation-src/toolbar.ts`: a round Eva mark that expands to Select element, Comments, Freeze, Sketch and Screenshot. The mark drags it; position and open state persist in `localStorage`. Plain DOM in a shadow root: web components cannot be imported into the injected script.
- The proxy injects it, so it shows in Eva's iframe and on a direct sandbox link. Direct link: Select copies the element context, Screenshot copies or downloads, Freeze works. Comments and Sketch show only inside Eva.
- `PreviewActionBar` and `usePreviewFreeze` are gone. `usePreviewToolbarBridge` sends Eva's state to the page (`eva-preview-toolbar-state`) and runs the actions the page reports (`eva-preview-toolbar-action`). Freeze is page-only, so `annotateFreeze` and `annotateFrozen` are removed.
- Open, the Eva mark turns into an X (Tabler IconX) at the right end of the bar, in the `text-destructive` colour (sent in the theme). It stays under the pointer: the tools open and close towards the left.
- Larger for accessibility: 44px buttons, 22px icons, 14px tooltip and notice text.
- The toolbar matches the old bar: the exact Tabler icon paths, colours, tooltip after 300 ms. Eva reads its resolved tokens (`readPreviewToolbarTheme`) and sends them with each state message, also when `<html>` changes class, so light and dark follow Eva. A direct link uses Eva's measured light or dark values by the page's colour scheme: re-measure them if the tokens change.
- `SCRIPT_VERSION` is `stream-v41`; the bundle is regenerated.
- Not checked in a browser: the proxy needs a sandbox relaunch.
