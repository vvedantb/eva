---
name: mobile-first-pass
description: Audit the Eva phone app (apps/mobile) against a 10-point mobile-first checklist and fix what fails, without changing the look. Use after building or changing phone screens, before shipping a mobile PR, or when the user asks for a "mobile-first pass", "mobile checklist", "check it works on a phone", or back/keyboard/touch/list issues on mobile.
---

# Mobile-first pass

The phone app copies the Eva web **look** (Inter, Tabler icons, web colours through `@vvedantb/native-ui`). Its **behaviour** must be mobile-first: the web is desktop-first, and there is no desktop APK. This pass checks behaviour, layout and accessibility. It never restyles.

## Scope

Every screen under `apps/mobile/app/` (tabs, pushed screens, auth) and the parts in `apps/mobile/src/`. If the change is small, audit only the screens it touches, but always run items 1, 3 and 5 on them.

## The checklist

Record each screen × item as pass, fixed or left, with evidence (a measurement, a screenshot or a code reference).

1. **Back.** Android hardware back and the header back go where the user expects.
   - An open sheet, dialog, menu or select mode closes first.
   - A pushed screen returns to the screen it came from, not to the first tab. The root layout must be a `Stack`, not a `Slot`: a `Slot` unmounts the tabs under a pushed screen.
   - A deep-linked screen (notification, inbox, shared link) uses `goBackOrReplace` with a sensible fallback.
   - After a submit that leaves the screen (create, start, archive), back cannot return to the dead form: use `replace`, or go back.
   - Tabs use `backBehavior: "firstRoute"`.
2. **Push, replace or sheet.** Section switches, segmented tabs and steppers change params with `setParams` or `replace` and add no history. Short choices and pickers are bottom sheets. Long forms are full screens.
3. **Sheets and dialogs.** Each one closes on a backdrop tap and on Android back, respects the bottom safe area, and scrolls when taller than the window. Its title stays on screen in a short window: test at about 390 × 460 as a stand-in for an open keyboard. A sheet with a text field focuses it on open (`onShow`).
4. **Keyboard.** Fields and composers stay above the keyboard. The chat keeps the newest message in view. Taps on rows work while the keyboard is up (`keyboardShouldPersistTaps`). Return submits or moves to the next field, as the web does.
5. **Touch targets.** Every control reaches at least 44 pt (hit slop is fine). **Measure that hit areas do not overlap:** slop larger than half the gap to a neighbour steals its taps. Rows packed in a tight pitch get vertical-only or no slop. Primary actions sit at the bottom, in thumb reach.
6. **Accessibility.** Icon-only buttons have `accessibilityLabel`. Tabs, pills, toggles and folds set selected or expanded state. Headers are marked. Text at 1.3× font scale does not clip.
7. **Motion.** Each animation has a purpose, lasts 250 ms or less, runs on the UI thread and respects Reduce Motion (`useReduceMotion`).
8. **Long lists.** Any list that can pass about 50 rows is virtualised with React Native's `FlatList` or `SectionList`, with stable keys. Add no new list dependency. For a chat, use native-ui `ConversationList`: `FlatList.scrollToEnd` uses estimated row heights, so a long thread can open at the top. Long diffs render in chunks with "Show N more lines".
9. **Light and dark.** Spot-check every changed screen in both themes.
10. **States.** Each data screen has loading, empty and error states. Use the web's wording where the web has one. Loading keeps the header and back.

## Where a fix goes

- The fault is in a native-ui part (sheet sizing, slop, a list part): fix it in `vvedantb/packages` `packages/native-ui`, with a changeset. Merge it, then pin `apps/mobile` to the merged commit.
- The fault is in app code (navigation, a screen's layout or state): fix it in `apps/mobile`.
- Never change visual tokens, type or icons in this pass. If a fix needs a visible change, report it as "chose X (not asked for)".

## How to check

- Use the browser preview of the phone app at 390 × 844 (see `eva-capture` and the build steps in `apps/mobile/README.md`). Never start a second web dev server.
- The browser cannot press Android hardware back or show the soft keyboard. Verify those by reading the code and by browser history (`agent-browser back`). Say plainly which items you verified only by code.
- Test actions on mock data only. Never send, create, archive, merge or review real items.

## Constraints

Follow `CLAUDE.md`. In particular:
- No `any`, `unknown`, `as` or `!`.
- No new dependencies.
- No `useCallback` or `useMemo`, and avoid `useEffect`.
- Never call a component as a function.
- Tests only call real code. Never read source files as text.

## Report

1. The checklist table (screens × items), with evidence.
2. Every visible change. Flag the ones you chose.
3. Kit changes and the changeset text.
4. What you could verify only by code.
