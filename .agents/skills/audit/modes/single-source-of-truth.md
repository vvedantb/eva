# Mode: single source of truth

Find every domain fact or piece of state that has more than one home, so one copy can drift from the others. Report copies that already differ first.

Run two searchers: **types and constants** (cross-package) and **state ownership** (UI).

## Signals: types and constants

| Signal | What to look for |
|---|---|
| Re-typed unions | `"draft" \| "open" \| "merged"` written by hand when a schema validator already defines it. Derive with `Infer<typeof validator>` / `Doc<"table">["field"]` instead |
| Lists repeated for runtime | The same status array in a URL parser, an MCP enum, a Zod schema and a validator. Build all of them from one tuple |
| Label and colour maps | `status → label` or `status → colour` defined in more than one component. Check the copies still agree (they often do not) |
| Text that states a number | Error or UI text that says "2-hour limit" or "20 minutes" while the constant says otherwise. Build the text from the constant |
| Numbers with no name | Ports, limits, timeouts, byte caps as bare literals in several files, or a web copy "that mirrors the server cap" |
| Stored identifiers built by hand | Branch names, cache keys, owner keys, entity ids rebuilt with template strings while a builder exists. These are stored, so drift breaks lookups |
| Link builders | Several functions that build the same URL. Look for edge cases one copy handles and another does not (empty segment, trailing slash, `undefined`) |
| Message names across a boundary | `postMessage` / iframe / worker message types typed as strings on each side |
| Copy-pasted helpers | Two implementations of the same parse, format or trim function |
| Allow/deny lists | Reserved names, permission lists, feature flags defined separately in client and server. The server copy is the one enforced |

## Signals: state ownership (UI)

| Signal | What to look for |
|---|---|
| Mirrored server state | `useState` seeded from a query or prop, then kept in sync by an effect |
| Derived values stored | A value computed from others but held in state, a ref, a store or localStorage |
| Two owners | The same fact in the URL and in local state or storage; or on the server and in sessionStorage |
| One value for many items | A single server field that every pane, tab or row reads, so one item's change moves all of them |
| Seeded once | A modal or form that copies a default at mount and never updates when the context (repo, user) changes. Use `picked ?? default` |
| Drafts that overwrite | An edit draft compared with the server value on blur, so leaving the field writes a stale value over a remote change. Keep the draft `null` until the user types |
| Forked logic per surface | The same flow (send, start, stop, providers) written per surface, so a fix to one does not reach the others |
| Partial feeds | A copy updated only from one event (keystrokes) while other paths (restore, sync, dictation) skip it |

## Out of scope

- Form drafts that intentionally fork from server data until save.
- Values re-exported from one definition.
- Generated files.

## Fix patterns

| Problem | Pattern |
|---|---|
| Re-typed union | Export the tuple once; build the validator, the Zod enum and the type from it |
| Drifted label/colour maps | One table next to the type; components import it |
| Text with a number | Build the text from the constant (`${HOURS}-hour`) |
| Stored identifiers | One builder per identifier; output must stay byte-identical. Grep for the old template afterwards |
| Shared web + server value | Put it in the shared package both import; never "mirror" by comment |
| Mirrored state | Delete the copy; derive during render. Keep optimistic updates in the data layer |
| One value for many items | Key the stored value by item id; keep the old field as the fallback for the first item (additive schema change) |
| Draft overwrites | `draft ?? serverValue`; save only if the user typed |
| Forked surface logic | One hook that takes the surface's mutations as arguments ("ports") |

## Pitfalls

- An extracted type helper can silently widen to `string`. The package that defines it may still typecheck; a consumer's typecheck catches it. Typecheck consumers too.
- A bundled script with a "no imports" rule can still take type-only imports, which are erased. Confirm the generated bundle is unchanged.
- Old rows keep old stored text after the fix; say so.
