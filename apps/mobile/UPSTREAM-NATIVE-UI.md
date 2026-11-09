# Upstream fixes needed in `@vvedantb/native-ui` (checked on 0.11.2; same code in 0.12.0)

Eva carries these as `patches/@vvedantb__native-ui@0.11.2.patch`. Move them upstream, then delete the patch.

## 1. `DropdownMenuContent` Modal has no host view (`src/DropdownMenu.tsx`)

The transparent `Modal` holds an `absoluteFill` `Pressable` (backdrop) and an absolutely positioned menu `View` as direct children. Neither has a full-size parent. `OverlayModal` (`src/primitives/overlay.tsx`) wraps its content in a `flex: 1` host with `pointerEvents="box-none"`.

Effect on device: the menu can sit under other layers (tab bar, blur) and taps miss the items. This looks like a z-index bug.

Fix: wrap the backdrop and menu in `<View style={{ flex: 1 }} pointerEvents="box-none">` inside the `Modal`.

## 2. `PromptInput` does not grow (`src/ai/prompt-input.tsx`)

- `layout="inline"` sets `numberOfLines={1}`. On Android this locks the line count. The stacked path already notes this.
- Only `maxHeight` is set. A multiline `TextInput` on Android does not grow from `maxHeight` alone, and there is no `onContentSizeChange` state.

Fix: track `contentSize.height`. Set `height: min(contentHeight, max)` (160, or 240 with larger text). Set `scrollEnabled` when content passes the cap. Reset the height on send. Remove `numberOfLines={1}`.

## 3. No exported `PortalHost`

`Select` uses `@rn-primitives/select` with a portal. native-ui does not export a `PortalHost`. Apps must add `@rn-primitives/portal` and mount its host themselves. Eva does not use `Select`, so it mounts none. Export a host, or document the requirement.
