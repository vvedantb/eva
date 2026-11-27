# Compact quick task rows in list view

- `QuickTaskCard` takes `layout: "card" | "row"`. The kanban board keeps `card`. The list view uses `row`: one line with number, title, age, status marks and the menu, like a session row.
- The row hides the author avatar, name and tags. A hover card shows them, with the description. It reuses `SidebarListHoverCard`, which gains an optional `details` slot for the tags.
- A draft comment shows as the pencil that session rows use for an unsent message, not a badge.
- Both layouts share the same checkbox, title, marks, age and menu nodes, so the two stay in step.
