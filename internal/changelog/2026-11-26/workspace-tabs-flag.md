# Editor, Computer and Files tabs move behind an experimental flag

- New `workspaceTabs` experimental flag (Settings → Experimental → Appearance), off by default.
- With it off, the sandbox panel of sessions and quick tasks hides Editor, Computer and Files, with their hotkeys, palette commands and quick-open; an old link bounces to Preview.
- One predicate (`isHiddenSandboxTab` / `useIsHiddenSandboxTab`) now owns both this rule and simple view's; `SimpleViewSandboxRedirect` is now `HiddenSandboxTabRedirect` and waits for the flags before it redirects.
- Chat file chips do nothing while Files is hidden, as in simple view.
