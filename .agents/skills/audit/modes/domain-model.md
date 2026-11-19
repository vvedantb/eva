# Mode: domain model

Find code where the data shape does not match the domain, so the code needs branches and guards to handle edge cases. A good model makes those edge cases disappear and makes properties easy to state and check. The reasons live in the `principle-model-the-domain` skill; read it first.

Report each finding as the property that the code cannot state today, and the structure that would state it.

## Signals

| Signal | What to look for |
|---|---|
| Parallel branches on one value | The same enum or status switched in several ternaries or `if` chains (colour, icon, label, text). Each `else` silently takes a new value |
| Renamed vocabulary | A local copy of a domain value with new names (`in_progress` → `inProgress`), so two words mean one thing |
| Fields nothing sets | Optional fields that no producer fills. Their formatters and edge cases are dead code |
| Sentinel values | `?? "current"`, `""`, `-1`, `0` standing in for "none". Two different "none" cases then collide |
| Guards for impossible states | Fallbacks (`\|\| ""`, `?.`, `>=` for `===`) for states an earlier check already rules out |
| Pairs that must agree | Two fields where only some combinations are valid (a duration on a pending step, `isLoading` with `data`) |
| Loose parameters | The same group of arguments passed together to several functions, with the same checks in each |
| Rules split by step | Load / validate / transform modules that each repeat the same domain rule |

## Out of scope

- Duplicated facts across files: use the `ssot` mode.
- Lifecycles spread across flags, and async races: use the `state-machines` mode.
- Code that is already clear, local and unlikely to grow. Do not force an abstraction.

## Fix patterns

| Problem | Pattern |
|---|---|
| Parallel branches | One `Record<Value, Style>` table; a new value fails the type check |
| Renamed vocabulary | Use the source type directly; derive it from the schema or the parent type |
| Fields nothing sets | Delete the field and every branch that reads it |
| Sentinel values | `undefined` or a discriminated union; handle "none" at the boundary |
| Impossible-state guards | Narrow once (non-empty first element, required id) and pass the narrowed value |
| Pairs that must agree | A discriminated union on the deciding field |
| Loose parameters | One typed object, parsed once at the boundary |

## Pitfalls

- A dead field can still be set by fixtures or demo pages. Grep the whole repo, and say what you deleted.
- Removing a sentinel can change visible behaviour (a panel that hid, now shows, or the reverse). Report it as a visible change.
