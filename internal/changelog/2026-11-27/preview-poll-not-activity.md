# Preview URL polls no longer keep a sandbox awake

- `sandbox.getPreviewUrl` no longer stamps `preview-tab` user activity. Every sandbox rail (session, quick task, project) resolves the preview URL on mount, on sandbox start and every 3 s until the dev server is ready, even when the Preview tab is hidden, the rail is collapsed or nobody is at the screen.
- Effect: the Sandbox status page showed "Kept awake by <user> via the Preview tab" for a user who only had the quick task page open, and a dev server that never became ready held the sandbox awake indefinitely.
- Real use still counts through the engagement-gated presence beacon (`viewing`) and the preview proxy's input ping (`preview-page`).
- The `preview-tab` source literal stays in `sandboxActivitySourceValidator` for existing rows.
