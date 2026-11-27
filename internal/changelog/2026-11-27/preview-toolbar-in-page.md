# Preview toolbar moves into the page

- New `preview-annotation-src/toolbar.ts`: a round Eva mark that expands to Select element, Comments, Freeze, Sketch and Screenshot. The mark drags it; position and open state persist in `localStorage`. Plain DOM in a shadow root: web components cannot be imported into the injected script.
- The proxy injects it, so it shows in Eva's iframe and on a direct sandbox link. Direct link: Select copies the element context, Screenshot copies or downloads, Freeze works. Comments and Sketch show only inside Eva.
- `PreviewActionBar` and `usePreviewFreeze` are gone. `usePreviewToolbarBridge` sends Eva's state to the page (`eva-preview-toolbar-state`) and runs the actions the page reports (`eva-preview-toolbar-action`). Freeze is page-only, so `annotateFreeze` and `annotateFrozen` are removed.
- `SCRIPT_VERSION` is `stream-v36`; the bundle is regenerated.
- Not checked in a browser: the proxy needs a sandbox relaunch.
