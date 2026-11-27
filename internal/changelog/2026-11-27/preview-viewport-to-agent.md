# The agent hears the preview's custom size

- A chat message now carries the preview frame size when the user set a custom one (a device preset, a dragged size, or contain mode): `<preview_viewport>` with width, height in CSS px and the device name for a preset. Fill mode adds nothing.
- The chat shows only what the user typed: the note rides in `message`, the typed text in `displayContent`. Harness commands and attachment-only sends get no note.
- `PreviewViewportContext` carries the size from `WebPreviewPanel` to `useChatSend`, in the same stack as the other pending-context providers, so session, quick task and project chats all get it.
- Select element already sent the page's own viewport in its `Environment` line, so it is unchanged.
